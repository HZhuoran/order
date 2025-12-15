import axios from 'axios';
import { PrismaClient, OrderStatus } from '@prisma/client';
import logger from './logger';

// 初始化Prisma客户端
const prisma = new PrismaClient();

// 订单类型定义（与已有订单查询API返回结构匹配）
export interface OrderFromAPI {
  orderId: string;
  waybillNo: string;
  courierCode: string;
  status: OrderStatus;
  // 可添加其他需要的字段（如用户ID、商品信息等）
}

// 从已有订单API获取待同步的订单列表
export const getPendingOrders = async (): Promise<OrderFromAPI[]> => {
  try {
    logger.info('开始调用订单查询API', { url: process.env.ORDER_QUERY_API_URL });
    const response = await axios.get(process.env.ORDER_QUERY_API_URL!, {
      headers: {
        // 若订单API需要鉴权，添加对应的请求头
        Authorization: `Bearer ${process.env.ORDER_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      params: {
        // 只查询待配送和已发货的订单，减少处理量
        status: ['PENDING', 'SHIPPED'].join(','),
      },
      timeout: 10000, // 10秒超时
    });

    // 假设API返回格式为 { code: 200, data: OrderFromAPI[] }
    if (response.data.code !== 200) {
      throw new Error(`订单API返回错误: ${response.data.message}`);
    }

    const orders = response.data.data as OrderFromAPI[];
    logger.info(`成功获取${orders.length}个待同步订单`);
    return orders;
  } catch (error) {
    logger.error('获取订单列表失败', { error });
    throw new Error('Failed to fetch pending orders');
  }
};

// 更新订单状态并记录日志
export const updateOrderStatus = async (
  orderId: string,
  oldStatus: OrderStatus,
  newStatus: OrderStatus
) => {
  try {
    // 使用事务确保状态更新和日志记录的原子性
    await prisma.$transaction(async (tx) => {
      // 1. 更新订单状态
      const updatedOrder = await tx.order.update({
        where: {
          orderId,
          status: oldStatus, // 确保状态未被其他流程修改
        },
        data: {
          status: newStatus,
        },
      });

      // 2. 记录状态变更日志
      await tx.orderStatusLog.create({
        data: {
          orderId,
          oldStatus,
          newStatus,
        },
      });

      logger.info('订单状态更新成功', {
        orderId,
        oldStatus,
        newStatus,
      });
      return updatedOrder;
    });
  } catch (error) {
    logger.error('更新订单状态失败', { orderId, oldStatus, newStatus, error });
    throw new Error('Failed to update order status');
  }
};

// 保存物流查询失败记录（用于后续重试）
export const saveLogisticsFailRecord = async (
  orderId: string,
  waybillNo: string,
  courierCode: string
) => {
  try {
    // 检查是否已有失败记录，有则更新失败次数和时间，无则创建
    const existingRecord = await prisma.logisticsFailRecord.findUnique({
      where: { orderId },
    });

    if (existingRecord) {
      await prisma.logisticsFailRecord.update({
        where: { orderId },
        data: {
          failCount: existingRecord.failCount + 1,
          lastFailTime: new Date(),
        },
      });
    } else {
      await prisma.logisticsFailRecord.create({
        data: {
          orderId,
          waybillNo,
          courierCode,
        },
      });
    }
    logger.warn('物流查询失败记录已保存', { orderId, waybillNo });
  } catch (error) {
    logger.error('保存物流失败记录失败', { orderId, error });
  }
};