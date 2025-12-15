import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { queryLogisticsStatus, LogisticsStatus } from '@/lib/logistics';

// 支持POST请求，接收单条物流查询参数
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { waybillNo, courierCode } = body;

    // 验证参数
    if (!waybillNo || !courierCode) {
      return NextResponse.json(
        { success: false, message: '运单号和快递公司编码不能为空' },
        { status: 400 }
      );
    }

    // 调用物流查询工具
    const result = await queryLogisticsStatus(waybillNo, courierCode);

    // 格式化响应结果
    return NextResponse.json({
      success: true,
      data: {
        waybillNo,
        courierCode,
        status: result.status,
        statusText: getStatusText(result.status),
        statusTime: result.statusTime,
        formattedTime: result.statusTime.toLocaleString(),
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '物流查询失败';
    logger.error('前端物流查询API异常', { error });
    return NextResponse.json(
      { success: false, message: errMsg },
      { status: 500 }
    );
  }
}

// 物流状态转中文显示
function getStatusText(status: LogisticsStatus): string {
  const statusMap = {
    [LogisticsStatus.DELIVERED]: '已送达',
    [LogisticsStatus.IN_TRANSIT]: '运输中',
    [LogisticsStatus.DELIVERY_FAILED]: '配送失败',
    [LogisticsStatus.UNKNOWN]: '状态未知',
  };
  return statusMap[status] || '状态未知';
}