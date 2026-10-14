import { useTranslation } from 'react-i18next';
import { Card, CardBody } from '@/components/ui/Card';
import { WalkInForm } from './WalkInForm';

export function WalkInPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-espresso">{t('walkIn.title')}</h1>

      <Card>
        <CardBody>
          <WalkInForm />
        </CardBody>
      </Card>
    </div>
  );
}
