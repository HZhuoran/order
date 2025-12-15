'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
// 导入全局CSS
import '@/app/globals.css';

// 常用快递公司映射（系统编码 -> 名称）
const COURIER_OPTIONS = [
  { value: 'SF', label: '顺丰速运' },
  { value: 'YTO', label: '圆通快递' },
  { value: 'ZTO', label: '中通快递' },
  { value: 'Yunda', label: '韵达快递' },
  { value: 'TTKDEX', label: '天天快递' },
  { value: 'JD', label: '京东物流' },
  { value: 'Cainiao', label: '菜鸟驿站' },
];

// 物流状态样式映射（对应CSS类名）
const STATUS_CLASS_MAP = {
  '已送达': 'status-delivered',
  '运输中': 'status-in-transit',
  '配送失败': 'status-failed',
  '状态未知': 'status-unknown',
  '查询中': 'status-querying',
  '查询失败': 'status-failed',
};

// 单个物流查询项类型
interface LogisticsItem {
  waybillNo: string;
  courierCode: string;
  courierLabel: string;
  status: string;
  statusTime?: Date;
  formattedTime?: string;
  message?: string;
}

// 并发查询工具函数（控制并发数量）
const concurrentRequest = async <T>(
  requests: (() => Promise<T>)[],
  limit = 3
): Promise<T[]> => {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const request of requests) {
    // 执行单个请求
    const promise = request().then((result) => {
      results.push(result);
      // 从执行队列中移除已完成的请求
      const index = executing.findIndex((p) => p === promise);
      if (index !== -1) executing.splice(index, 1);
    });

    executing.push(promise);

    // 控制并发数量
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  // 等待所有请求完成
  await Promise.all(executing);
  return results;
};

export default function LogisticsQueryPage() {
  // 状态管理
  const [waybillText, setWaybillText] = useState(''); // 批量单号输入框
  const [defaultCourier, setDefaultCourier] = useState('SF'); // 默认快递公司
  const [queryList, setQueryList] = useState<LogisticsItem[]>([]); // 查询列表
  const [isQuerying, setIsQuerying] = useState(false); // 查询中状态
  const [queryProgress, setQueryProgress] = useState(0); // 查询进度
  const [historyList, setHistoryList] = useState<LogisticsItem[]>([]); // 查询历史

  // 初始化时加载查询历史
  useEffect(() => {
    const savedHistory = localStorage.getItem('logisticsHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory).map((item: any) => ({
          ...item,
          statusTime: item.statusTime ? new Date(item.statusTime) : undefined,
        }));
        setHistoryList(parsedHistory);
      } catch (e) {
        localStorage.removeItem('logisticsHistory');
      }
    }
  }, []);

  // 处理单号输入（自动去重、过滤空行）
  const handleWaybillChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // 去重并过滤空行
    const uniqueLines = Array.from(new Set(value.split('\n')))
      .map(line => line.trim())
      .filter(line => line);
    setWaybillText(uniqueLines.join('\n'));
  };

  // 构建查询请求列表
  const buildRequestList = (): { items: LogisticsItem[], requests: (() => Promise<any>)[] } => {
    const waybillNos = waybillText.split('\n').filter(no => no.trim());
    const items: LogisticsItem[] = waybillNos.map(no => ({
      waybillNo: no.trim(),
      courierCode: defaultCourier,
      courierLabel: COURIER_OPTIONS.find(opt => opt.value === defaultCourier)?.label || '未知',
      status: '查询中',
    }));

    // 构建并发请求
    const requests = items.map((item, index) => async () => {
      try {
        const response = await fetch('/api/logistics/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waybillNo: item.waybillNo,
            courierCode: item.courierCode,
          }),
        });
        const data = await response.json();

        // 更新进度
        setQueryProgress(prev => Math.min(100, Math.floor(((index + 1) / waybillNos.length) * 100)));

        if (data.success) {
          return {
            ...item,
            status: data.data.statusText,
            statusTime: new Date(data.data.statusTime),
            formattedTime: format(new Date(data.data.statusTime), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
          };
        } else {
          return { ...item, status: '查询失败', message: data.message };
        }
      } catch (error) {
        setQueryProgress(prev => Math.min(100, Math.floor(((index + 1) / waybillNos.length) * 100)));
        return { ...item, status: '查询失败', message: '网络异常' };
      }
    });

    return { items, requests };
  };

  // 执行批量查询
  const handleQuery = async () => {
    if (!waybillText.trim()) {
      alert('请输入至少一个物流单号');
      return;
    }

    const { items, requests } = buildRequestList();
    setQueryList(items);
    setIsQuerying(true);
    setQueryProgress(0);

    try {
      // 并发执行查询（限制3个并发）
      const results = await concurrentRequest(requests, 3);
      setQueryList(results);
      setIsQuerying(false);

      // 保存到查询历史（最多保存20条）
      const newHistory = [...results, ...historyList].slice(0, 20);
      setHistoryList(newHistory);
      localStorage.setItem('logisticsHistory', JSON.stringify(newHistory));
    } catch (error) {
      setIsQuerying(false);
      alert('批量查询异常，请重试');
    }
  };

  // 清除查询结果
  const handleClear = () => {
    setWaybillText('');
    setQueryList([]);
    setQueryProgress(0);
  };

  // 清除查询历史
  const handleClearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem('logisticsHistory');
  };

  // 单个单号修改快递公司
  const handleCourierChange = (waybillNo: string, newCourier: string) => {
    setQueryList(prev =>
      prev.map(item =>
        item.waybillNo === waybillNo
          ? {
              ...item,
              courierCode: newCourier,
              courierLabel: COURIER_OPTIONS.find(opt => opt.value === newCourier)?.label || '未知',
            }
          : item
      )
    );
  };

  // 重新查询单个单号
  const reQueryItem = async (item: LogisticsItem) => {
    setQueryList(prev =>
      prev.map(i =>
        i.waybillNo === item.waybillNo ? { ...i, status: '查询中', message: '' } : i
      )
    );

    try {
      const response = await fetch('/api/logistics/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillNo: item.waybillNo,
          courierCode: item.courierCode,
        }),
      });
      const data = await response.json();

      let updatedItem;
      if (data.success) {
        updatedItem = {
          ...item,
          status: data.data.statusText,
          statusTime: new Date(data.data.statusTime),
          formattedTime: format(new Date(data.data.statusTime), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
        };
      } else {
        updatedItem = { ...item, status: '查询失败', message: data.message };
      }

      // 更新列表和历史
      setQueryList(prev => prev.map(i => i.waybillNo === item.waybillNo ? updatedItem : i));
      setHistoryList(prev => {
        const newHistory = prev.map(i => i.waybillNo === item.waybillNo ? updatedItem : i);
        localStorage.setItem('logisticsHistory', JSON.stringify(newHistory));
        return newHistory;
      });
    } catch (error) {
      setQueryList(prev =>
        prev.map(i =>
          i.waybillNo === item.waybillNo
            ? { ...i, status: '查询失败', message: '网络异常' }
            : i
        )
      );
    }
  };

  return (物流单号批量查询

      {/* 查询表单区域 */}
      <textarea
            id="waybillInput"
            value={ onChange={handleWaybillChange}
            placeholder="请输入物流单号，例如：
YT1234567890123
SF9876543210987"
            disabled={isQuerying}
          /><select
              id="courierSelect"
              value={ setDefaultCourier(e.target.value)}
              disabled={isQuerying}
            >
              {COURIER_OPTIONS.map(option => (
                <option key={.value} value={option.value}>
                  {option.label}
                
              ))}
            <button
              className="btn btn-primary"
              onClick={ing}
            >
              {isQuerying ? '查询中...' : '批量查询'}
           <button
              className="btn btn-secondary"
              onClick={清空
             {/* 查询进度条（查询中显示） */}
        {isQuerying && (
          查询进度{queryProgress}%<div
                className="progress-fill"
                style={queryProgress}%` }}
              >
        )}
      

      {/* 查询结果区域 */}
      {queryList.length > 0 && (
        
            查询结果
            共{queryList.length}条记录物流单号快递公司物流状态状态更新时间操作 {queryList.map((item, index) => (
                  <tr key={ + item.waybillNo}>
                    {item.waybillNo}
                      {!isQuerying && (
                       <select
                          value={ handleCourierChange(item.waybillNo, e.target.value)}
                          style={{ maxWidth: '150px' }}
                        >
                          {COURIER_OPTIONS.map(option => (
                            <option key={={option.value}>
                              {option.label}
                           
                          ))}
                        
                      )}
                      {isQuerying && {item.courierLabel}}
                    <span className={]}`}>
                        {item.status}
                      
                      {item.message && (
                        {item.message} )}
                    {item.formattedTime || '-'}<a
                        className="text-primary"
                        onClick={ reQueryItem(item)}
                        style={{ pointerEvents: isQuerying ? 'none' : 'auto' }}
                      >
                        重新查询
                      
                ))}
              
      )}

      {/* 查询历史区域 */}
      {historyList.length > 0 && (
            查询历史<a
              className="text-sm text-gray-500"
              onClick={: 'pointer' }}
            >
              清空历史
            物流单号快递公司物流状态状态更新时间操作
                {historyList.map((item, index) => (
                  <tr key={{item.waybillNo}{item.courierLabel}<span className={adge ${STATUS_CLASS_MAP[item.status]}`}>
                        {item.status}
{item.formattedTime || '-'}<a
                        className="text-primary"
                        onClick={ reQueryItem(item)}
                        style={{ pointerEvents: isQuerying ? 'none' : 'auto' }}
                      >
                        重新查询
                      
                ))}
              
      )}
    
  );
}