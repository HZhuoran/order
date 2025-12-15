import { DeliveryTracker, TrackResult } from 'delivery-tracker';
import logger from './logger';

// 快递公司编码映射（key：系统内编码，value：delivery-tracker支持的编码）
// 完整编码列表可参考：https://github.com/shlee322/delivery-tracker#supported-couriers
const COURIER_CODE_MAPPING: Record<string, string> = {
  SF: 'sfexpress', // 顺丰
  YTO: 'yto', // 圆通
  ZTO: 'zto', // 中通
  Yunda: 'yunda', // 韵达
  TTKDEX: 'ttkdex', // 天天快递
  JD: 'jdlogistics', // 京东物流
  Cainiao: 'cainiao', // 菜鸟
  // 可根据实际需求扩展更多快递公司
};

// 物流状态枚举（简化版）
export enum LogisticsStatus {
  DELIVERED = 'Delivered', // 已送达
  IN_TRANSIT = 'InTransit', // 运输中
  DELIVERY_FAILED = 'DeliveryFailed', // 配送失败
  UNKNOWN = 'Unknown', // 未知状态
}

// 物流查询结果类型
export interface LogisticsQueryResult {
  status: LogisticsStatus;
  statusTime: Date; // 状态更新时间
  rawResult?: TrackResult; // 原始查询结果（便于调试）
}

// 初始化物流查询客户端
const logisticsTracker = new DeliveryTracker();

// 根据运单号和快递公司查询物流状态
export const queryLogisticsStatus = async (
  waybillNo: string,
  systemCourierCode: string
): Promise<LogisticsQueryResult> => {
  // 1. 验证参数
  if (!waybillNo || !systemCourierCode) {
    throw new Error('运单号和快递公司编码不能为空');
  }

  // 2. 映射快递公司编码
  const trackerCourierCode = COURIER_CODE_MAPPING[systemCourierCode];
  if (!trackerCourierCode) {
    throw new Error(`不支持的快递公司：${systemCourierCode}`);
  }

  try {
    logger.info('开始查询物流状态', {
      waybillNo,
      systemCourierCode,
      trackerCourierCode,
    });

    // 3. 调用delivery-tracker查询物流
    const trackResult = await logisticsTracker.track(
      trackerCourierCode,
      waybillNo
    );

    // 4. 解析物流状态（根据返回的lastStatus判断）
    const lastStatus = trackResult.lastStatus.toLowerCase();
    let logisticsStatus: LogisticsStatus = LogisticsStatus.UNKNOWN;

    if (lastStatus.includes('delivered') || lastStatus.includes('签收')) {
      logisticsStatus = LogisticsStatus.DELIVERED;
    } else if (
      lastStatus.includes('fail') ||
      lastStatus.includes('异常') ||
      lastStatus.includes('拒收')
    ) {
      logisticsStatus = LogisticsStatus.DELIVERY_FAILED;
    } else if (
      lastStatus.includes('transit') ||
      lastStatus.includes('运输') ||
      lastStatus.includes('派送')
    ) {
      logisticsStatus = LogisticsStatus.IN_TRANSIT;
    }

    logger.info('物流状态查询成功', {
      waybillNo,
      status: logisticsStatus,
      statusTime: trackResult.lastTime,
    });

    return {
      status: logisticsStatus,
      statusTime: new Date(trackResult.lastTime),
      rawResult: trackResult,
    };
  } catch (error) {
    logger.error('物流状态查询失败', {
      waybillNo,
      systemCourierCode,
      error,
    });
    throw new Error('Failed to query logistics status');
  }
};