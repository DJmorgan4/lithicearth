import { AncientSite } from '../types';

export const ANCIENT_SITES: AncientSite[] = [
  {
    id: 'gobekli-tepe',
    name: 'Göbekli Tepe',
    location: { latitude: 37.2232, longitude: 38.9225 },
    era: '9600 BCE',
    type: 'temple',
    culture: 'Pre-Pottery Neolithic',
    description: 'The oldest known temple complex.',
    mysteries: ['Built before agriculture', 'Deliberately buried'],
    unlocked: true,
  },
  {
    id: 'giza',
    name: 'Giza Pyramids',
    location: { latitude: 29.9792, longitude: 31.1342 },
    era: '2580 BCE',
    type: 'pyramid',
    culture: 'Ancient Egyptian',
    description: 'Precision engineering marvel.',
    mysteries: ['Perfect astronomical alignment', 'Construction methods'],
    unlocked: true,
  },
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    location: { latitude: 51.1789, longitude: -1.8262 },
    era: '3000 BCE',
    type: 'megalith',
    culture: 'Neolithic Britain',
    description: 'Iconic stone circle.',
    mysteries: ['Stone transportation', 'Acoustic properties'],
    unlocked: true,
  },
];
