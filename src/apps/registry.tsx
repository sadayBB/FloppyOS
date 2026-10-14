import type { ComponentType } from 'react';
import type { AppId } from './meta';
import Ask from './Ask';
import Calendar from './Calendar';
import Cards from './Cards';
import Grades from './Grades';
import Projects from './Projects';
import Inbox from './Inbox';
import Notes from './Notes';
import Search from './Search';
import Settings from './Settings';
import Stickers from './Stickers';
import Subjects from './Subjects';
import Tasks from './Tasks';
import Timer from './Timer';
import Today from './Today';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const APP_COMPONENTS: Record<AppId, ComponentType<any>> = {
  today: Today,
  inbox: Inbox,
  tasks: Tasks,
  calendar: Calendar,
  subjects: Subjects,
  timer: Timer,
  notes: Notes,
  search: Search,
  stickers: Stickers,
  settings: Settings,
  grades: Grades,
  projects: Projects,
  cards: Cards,
  ask: Ask,
};
