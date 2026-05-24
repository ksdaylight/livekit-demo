# rtcLive TS 验收清单

## 环境

- 已安装 Docker
- 已复制并修改 `.env`
- `docker compose` 所有服务均为 running
- Web 可访问
- API 健康可用
- LiveKit 可连接
- MinIO bucket 已创建

## 功能

- 主持人可注册
- 主持人可登录
- 主持人可创建会议
- 访客可加入会议
- 会议密码校验正常
- 摄像头正常
- 麦克风正常
- 屏幕共享正常
- 聊天同步正常
- 文件上传下载正常
- 白板绘制同步正常
- 白板图片上传正常
- 主持人禁言正常
- 主持人媒体锁定正常
- 主持人解散会议正常
- 会议历史可查看

## 已知边界

- 第一版为单机 Docker Compose 部署。
- 多 API 实例需要补 Redis Pub/Sub WebSocket 适配。
- 生产 LiveKit 建议替换 dev 模式配置。
