import winston from 'winston';

// 初始化日志实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // 日志级别，从环境变量获取
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // 添加时间戳
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // 自定义日志输出格式
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // 输出到控制台
    // 生产环境可添加文件日志（本地开发可选）
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'combined.log' })
  ],
});

export default logger;