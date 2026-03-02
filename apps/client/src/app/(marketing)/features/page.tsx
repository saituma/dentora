import {
  PhoneIcon,
  CalendarIcon,
  FileTextIcon,
  PlugIcon,
  BarChart3Icon,
  ShieldIcon,
} from 'lucide-react';

const features = [
  {
    icon: PhoneIcon,
    title: '24/7 call handling',
    description:
      'AI answers every call, day or night. Captures leads and books appointments when your front desk is busy or closed.',
  },
  {
    icon: CalendarIcon,
    title: 'Appointment booking',
    description:
      'Checks availability in real time. Books, reschedules, and cancels appointments with natural conversation.',
  },
  {
    icon: FileTextIcon,
    title: 'Knowledge base',
    description:
      'Upload your services, pricing, and FAQs. The AI references your clinic-specific data for accurate answers.',
  },
  {
    icon: PlugIcon,
    title: 'Integrations',
    description:
      'Connects with Google Calendar, Outlook, and practice management systems. Syncs seamlessly.',
  },
  {
    icon: BarChart3Icon,
    title: 'Analytics',
    description:
      'Track missed call capture rate, call-to-booking conversion, revenue recovered, and more.',
  },
  {
    icon: ShieldIcon,
    title: 'HIPAA compliant',
    description:
      'Built for healthcare. Data encrypted, access controlled, and designed for compliance.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold">Everything you need</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A complete AI receptionist solution for dental practices
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="flex gap-4 rounded-lg border p-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <f.icon className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
