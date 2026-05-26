import { describe, expect, it, vi } from 'vitest';
import { roomCodeSchema } from '@rtclive/shared';
import { ParticipantService } from '../participants/participant.service';
import { MeetingService } from './meeting.service';

type MeetingRecord = {
  id: string;
  roomCode: string;
  title: string;
  hostId: string;
  passwordHash: string | null;
  status: 'active' | 'dissolved' | 'expired';
  dissolvedAt: Date | null;
  createdAt: Date;
};

type ParticipantRecord = {
  id: string;
  meetingId: string;
  identity: string;
  displayName: string;
  role: 'host' | 'guest';
  participantKeyHash: string;
  joinedAt: Date;
  leftAt: Date | null;
};

function createMeetingHarness() {
  const db = {
    meetings: [] as MeetingRecord[],
    participants: [] as ParticipantRecord[],
  };
  let meetingId = 0;
  let participantId = 0;

  function meetingWithParticipants(meeting: MeetingRecord) {
    return {
      ...meeting,
      participants: db.participants.filter((participant) => participant.meetingId === meeting.id),
    };
  }

  const prisma = {
    meeting: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; roomCode?: string } }) => {
        const meeting = db.meetings.find((item) =>
          where.id ? item.id === where.id : item.roomCode === where.roomCode,
        );
        return meeting ? meetingWithParticipants(meeting) : null;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const meeting: MeetingRecord = {
          id: `meeting-${++meetingId}`,
          roomCode: data.roomCode,
          title: data.title,
          hostId: data.hostId,
          passwordHash: data.passwordHash ?? null,
          status: 'active',
          dissolvedAt: null,
          createdAt: new Date(Date.UTC(2026, 0, meetingId)),
        };
        db.meetings.push(meeting);
        return meeting;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const meeting = db.meetings.find((item) => item.id === where.id);
        if (!meeting) throw new Error('meeting not found');
        if ('status' in data) meeting.status = data.status;
        if ('dissolvedAt' in data) meeting.dissolvedAt = data.dissolvedAt;
        if ('passwordHash' in data) meeting.passwordHash = data.passwordHash;
        if (data.participants?.updateMany) {
          const participantData = data.participants.updateMany.data;
          for (const participant of db.participants) {
            if (participant.meetingId === meeting.id && participant.leftAt === null) {
              Object.assign(participant, participantData);
            }
          }
        }
        return meetingWithParticipants(meeting);
      }),
    },
    participant: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const participant: ParticipantRecord = {
          id: `participant-${++participantId}`,
          meetingId: data.meetingId,
          identity: data.identity,
          displayName: data.displayName,
          role: data.role,
          participantKeyHash: data.participantKeyHash,
          joinedAt: new Date(Date.UTC(2026, 1, participantId)),
          leftAt: null,
        };
        db.participants.push(participant);
        return participant;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<ParticipantRecord> }) => {
          const participant = db.participants.find((item) => item.id === where.id);
          if (!participant) throw new Error('participant not found');
          Object.assign(participant, data);
          return participant;
        },
      ),
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        const participant = db.participants.find((item) => {
          if (where.identity && item.identity !== where.identity) return false;
          const meeting = db.meetings.find((candidate) => candidate.id === item.meetingId);
          if (!meeting) return false;
          if (where.meeting?.roomCode && meeting.roomCode !== where.meeting.roomCode) return false;
          if (where.meeting?.status && meeting.status !== where.meeting.status) return false;
          return true;
        });
        if (!participant) return null;
        const meeting = db.meetings.find((item) => item.id === participant.meetingId);
        return { ...participant, meeting, mediaLock: null };
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: any; data: Partial<ParticipantRecord> }) => {
          let count = 0;
          for (const participant of db.participants) {
            const meeting = db.meetings.find((item) => item.id === participant.meetingId);
            if (where.identity && participant.identity !== where.identity) continue;
            if (where.leftAt === null && participant.leftAt !== null) continue;
            if (where.meeting?.roomCode && meeting?.roomCode !== where.meeting.roomCode) continue;
            Object.assign(participant, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
  };

  const livekit = {
    ensureRoom: vi.fn(async () => undefined),
    deleteRoom: vi.fn(async () => undefined),
    getPublicUrl: vi.fn(() => 'ws://livekit.test'),
    createJoinToken: vi.fn(async ({ identity }: { identity: string }) => `token-${identity}`),
  };
  const participants = new ParticipantService(prisma as any);
  const service = new MeetingService(prisma as any, livekit as any, participants);
  return { db, livekit, service };
}

describe('meeting contracts', () => {
  it('uses 4-character uppercase room codes', () => {
    // 服务层和数据库都依赖 roomCode 标准化，测试共享 schema 能保证输入统一。
    expect(roomCodeSchema.parse('z9x8')).toBe('Z9X8');
    expect(() => roomCodeSchema.parse('abc')).toThrow();
  });
});

describe('meeting host rejoin', () => {
  const host = { id: 'user-host', displayName: 'Host User' };

  it('keeps anonymous participants as guests', async () => {
    const { service } = createMeetingHarness();
    await service.createMeeting(host, { roomCode: 'A1B2', title: 'Daily', password: undefined });

    const join = await service.joinMeeting('A1B2', { displayName: 'Guest' });

    expect(join.role).toBe('guest');
    expect(join.identity).toMatch(/^g-/);
  });

  it('keeps logged-in non-owners as guests', async () => {
    const { service } = createMeetingHarness();
    await service.createMeeting(host, { roomCode: 'B2C3', title: 'Daily', password: undefined });

    const join = await service.joinMeeting(
      'B2C3',
      { displayName: 'Other' },
      { id: 'user-other', displayName: 'Other Account' },
    );

    expect(join.role).toBe('guest');
    expect(join.displayName).toBe('Other');
  });

  it('lets the owner rejoin a protected meeting as host without the meeting password', async () => {
    const { db, service } = createMeetingHarness();
    const firstJoin = await service.createMeeting(host, {
      roomCode: 'C3D4',
      title: 'Protected',
      password: 'secret',
    });

    await service.leave('C3D4', firstJoin.identity, firstJoin.participantKey);
    expect(db.meetings[0].status).toBe('active');

    const rejoin = await service.joinMeeting('C3D4', { displayName: 'Ignored' }, host);

    expect(rejoin.role).toBe('host');
    expect(rejoin.displayName).toBe(host.displayName);
    expect(rejoin.identity).toBe(firstJoin.identity);
    expect(rejoin.participantKey).not.toBe(firstJoin.participantKey);
    await expect(service.dissolve('C3D4', rejoin.identity, rejoin.participantKey)).resolves.toEqual(
      { ok: true },
    );
    expect(db.meetings[0].status).toBe('dissolved');
  });

  it('creates a new host participant when the original host is still online', async () => {
    const { db, service } = createMeetingHarness();
    const firstJoin = await service.createMeeting(host, {
      roomCode: 'D4E5',
      title: 'Online',
      password: undefined,
    });

    const secondJoin = await service.joinMeeting('D4E5', { displayName: 'Ignored' }, host);

    expect(secondJoin.role).toBe('host');
    expect(secondJoin.identity).toMatch(/^h-/);
    expect(secondJoin.identity).not.toBe(firstJoin.identity);
    expect(db.participants.filter((participant) => participant.role === 'host')).toHaveLength(2);
  });
});
