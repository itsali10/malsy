import type { Metadata } from 'next';
import AdminLayoutClient from '../../components/admin/AdminLayoutClient';

export const metadata: Metadata = {
  title: 'MALSY — Admin',
  description: 'MALSY administration dashboard',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
