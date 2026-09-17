import { DemoModulePage } from '@/demo/demo-module-page';
import { headers } from 'next/headers';

export default async function DemoModuleRoute() {
  const path = (await headers()).get('x-demo-module-path') || '/admin';
  return <DemoModulePage initialPath={path} />;
}
