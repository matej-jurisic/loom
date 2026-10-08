import { Hash, Layers, ListChecks, ListTodo, Shapes, Target, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'

interface Term {
  name: string
  Icon: LucideIcon
  what: string
  relation: string
  example: string
}

const core: Term[] = [
  {
    name: 'Activity',
    Icon: Layers,
    what: 'What you do. Created once, reused.',
    relation: 'Category, tags, goals, subtasks and work types are all set here. Deleting it also deletes its occurrences.',
    example: 'Thesis work',
  },
  {
    name: 'Occurrence',
    Icon: ListTodo,
    what: 'One time you do it. This is what sits on the calendar.',
    relation: 'One activity per occurrence. It uses that activity\'s category, goals and tags.',
    example: 'Thesis work, Tue 14:00',
  },
]

const organise: Term[] = [
  {
    name: 'Category',
    Icon: Shapes,
    what: 'Colour and icon.',
    relation: 'One per activity. Deleting it leaves the activities alone.',
    example: 'Study',
  },
  {
    name: 'Tag',
    Icon: Hash,
    what: 'Free label.',
    relation: 'Any number per activity. Deleting it leaves the activities alone.',
    example: 'Year 3',
  },
  {
    name: 'Goal',
    Icon: Target,
    what: 'What you are working toward.',
    relation: 'Any number per activity. Every done occurrence counts toward all its goals.',
    example: 'Finish thesis',
  },
]

const detail: Term[] = [
  {
    name: 'Subtask',
    Icon: ListChecks,
    what: 'A to-do inside an occurrence.',
    relation: 'The activity keeps a template. Each new occurrence gets its own copy to tick off.',
    example: 'Write a page',
  },
  {
    name: 'Work type',
    Icon: Timer,
    what: 'A label for splitting the time you spent.',
    relation: 'The activity keeps the list. An occurrence picks from it when you split its time.',
    example: 'Reading, Writing',
  },
]

function Group({ title, terms }: { title: string; terms: Term[] }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {terms.map((t) => (
          <li key={t.name} className="flex items-start gap-3 px-4 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <t.Icon className="h-[15px] w-[15px] text-primary" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-semibold text-foreground">{t.name}</span>
                <span className="text-sm text-foreground/90">{t.what}</span>
                <span className="text-xs text-muted-foreground">e.g. {t.example}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">→ {t.relation}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function GuidePage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title="Guide" />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl">
          <Group title="The core" terms={core} />
          <Group title="Ways to organise" terms={organise} />
          <Group title="Inside an occurrence" terms={detail} />
        </div>
      </div>
    </div>
  )
}
