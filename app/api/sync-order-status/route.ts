import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, OrderStatus } from '@prisma/client';
import logger from '@/lib/logger';
import { getPendingOrders, updateOrderStatus, saveLogisticsFailRecord } from '@/lib/order';
import { queryLogisticsStatus, LogisticsStatus } from '@/lib/logistics';

// 初始化Prisma客户端
const prisma = new PrismaClient();

// 支持GET请求（Vercel定时任务通过GET触发）
export async function GET(request: NextRequest) {
  // 1. 接口鉴权（防止恶意调用）
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedAuth) {
    logger.error('订单同步API鉴权失败', { authHeader });
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 2. 初始化任务统计信息
  const taskStats = {
    totalOrders: 0,
    successCount: 0,
    failCount: 0,
    deliveredCount: 0,
    failedDeliveryCount: 0,
  };

  try {
    logger.info('========== 订单状态同步任务开始 ==========');

    // 3. 步骤1：获取待同步订单（从已有订单API）
    const pendingOrders = await getPendingOrders();
    taskStats.totalOrders = pendingOrders.length;

    if (pendingOrders.length === 0) {
      logger.info('无待同步订单，任务结束');
      return NextResponse.json({
        success: true,
        message: 'No pending orders to sync',
        stats: taskStats,
      });
    }

    // 4. 步骤2：遍历订单，查询物流并更新状态
    for (const order of pendingOrders) {
      try {
        // 4.1 先检查本地数据库是否已有该订单，无则创建
        const existingOrder = await prisma.order.findUnique({
          where: { orderId: order.orderId },
        });

        if (!existingOrder) {
          await prisma.order.create({
            data: {
              orderId: order.orderId,
              waybillNo: order.waybillNo,
              courierCode: order.courierCode,
              status: order.status,
            },
          });
          logger.info('新增订单记录', { orderId: order.orderId });
        }

        // 4.2 查询物流状态
        const logisticsResult = await queryLogisticsStatus(
          order.waybillNo,
          order.courierCode
        );

        // 4.3 根据物流状态更新订单状态
        if (logisticsResult.status === LogisticsStatus.DELIVERED) {
          await updateOrderStatus(
            order.orderId,
            order.status,
            OrderStatus.DELIVERED
          );
          taskStats.deliveredCount++;
        } else if (logisticsResult.status === LogisticsStatus.DELIVERY_FAILED) {
          await updateOrderStatus(
            order.orderId,
            order.status,
            OrderStatus.DELIVERY_FAILED
          );
          taskStats.failedDeliveryCount++;
        }

        taskStats.successCount++;
      } catch (error) {
        // 单个订单处理失败，记录并继续处理下一个
        taskStats.failCount++;
        await saveLogisticsFailRecord(
          order.orderId,
          order.waybillNo,
          order.courierCode
        );
        continue;
      }
    }

    logger.info('========== 订单状态同步任务结束 ==========', { taskStats });
    return NextResponse.json({
      success: true,
      message: 'Order status sync completed',
      stats: taskStats,
    });
  } catch (error) {
    // 任务整体失败（如获取订单列表失败）
    logger.error('订单同步任务整体失败', { error });
    return NextResponse.json(
      {
        success: false,
        message: 'Order status sync task failed',
        stats: taskStats,
      },
      { status: 500 }
    );
  }
}