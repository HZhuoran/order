import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // 导入Tailwind样式

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '物流单号查询系统',
  description: '批量并发查询物流单号状态',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // return ();
}