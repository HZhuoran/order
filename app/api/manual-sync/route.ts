import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, OrderStatus } from '@prisma/client';
import logger from '@/lib/logger';
import { updateOrderStatus } from '@/lib/order';
import { queryLogisticsStatus, LogisticsStatus } from '@/lib/logistics';

const prisma = new PrismaClient();

// 支持POST请求（传递订单ID）
export async function POST(request: NextRequest) {
  try {
    // 1. 获取请求参数
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: 'orderId is required' },
        { status: 400 }
      );
    }

    // 2. 查询本地订单信息
    const order = await prisma.order.findUnique({
      where: { orderId },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: `Order ${orderId} not found` },
        { status: 404 }
      );
    }

    // 3. 已完成的订单不重复处理
    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.DELIVERY_FAILED) {
      return NextResponse.json({
        success: false,
        message: `Order ${orderId} is already in final status: ${order.status}`,
      });
    }

    // 4. 查询物流并更新状态
    const logisticsResult = await queryLogisticsStatus(
      order.waybillNo,
      order.courierCode
    );

    let updateResult = null;
    if (logisticsResult.status === LogisticsStatus.DELIVERED) {
      updateResult = await updateOrderStatus(
        orderId,
        order.status,
        OrderStatus.DELIVERED
      );
    } else if (logisticsResult.status === LogisticsStatus.DELIVERY_FAILED) {
      updateResult = await updateOrderStatus(
        orderId,
        order.status,
        OrderStatus.DELIVERY_FAILED
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Manual sync completed',
      data: {
        orderId,
        currentStatus: updateResult ? updateResult.status : order.status,
        logisticsStatus: logisticsResult.status,
        statusTime: logisticsResult.statusTime,
      },
    });
  } catch (error) {
    logger.error('手动同步订单失败', { error });
    return NextResponse.json(
      { success: false, message: 'Manual sync failed' },
      { status: 500 }
    );
  }
}