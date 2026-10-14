import {
  Heart, HeartPulse, Activity, Dumbbell, Bike, Footprints, Volleyball, Timer, Wind, Pill, Stethoscope, Syringe, Bandage, Eye, Glasses,
  Briefcase, Laptop, Calendar, CalendarCheck, AlarmClock, Hourglass, ClipboardList, Clipboard, ListChecks, ListTodo, Kanban, Presentation, Target, FileText, Pen, Inbox, Mail, Send, Archive, Folder, Paperclip,
  DollarSign, Coins, Banknote, CreditCard, Wallet, PiggyBank, TrendingUp, ChartPie, Percent, Receipt, Calculator, Landmark,
  BookOpen, GraduationCap, Brain, Bookmark, Lightbulb, Library, Languages, Microscope, FlaskConical, Newspaper,
  Users, Baby, Handshake, HeartHandshake, MessageSquare, Phone, Gift, PartyPopper, Cake, Church, Dog, Cat, PawPrint,
  Home, Bed, Bath, Sofa, Lamp, WashingMachine, Plug, Hammer, Drill, Wrench, Paintbrush, Brush, Scissors, Shirt, Recycle, Key, Lock,
  UtensilsCrossed, CookingPot, Coffee, Apple, Salad, Carrot, Egg, Croissant, Sandwich, Soup, Pizza, IceCreamCone, Cherry, Wine, Beer,
  ShoppingCart, ShoppingBag, Store, Package, Truck,
  Car, Bus, TrainFront, Plane, Ship, Sailboat, Anchor, Fuel, Map, MapPin, Compass, Luggage, Hotel, Ticket, Tent, Globe,
  Music, Film, Tv, Gamepad2, Headphones, Mic, Guitar, Camera, Palette, Drama, Puzzle, Dices, Swords,
  Leaf, Sprout, Flower, Flower2, Clover, TreePine, Mountain, Sun, Moon, Cloud, CloudRain, Rainbow, Snowflake, Umbrella, Droplet, Zap, Bird, Fish, Rabbit,
  Smartphone, Monitor, Keyboard, Printer, Cpu, HardDrive, Wifi, Code2, Terminal, Bug, Bot, Headset,
  Star, Flag, Trophy, Medal, Award, Crown, Gem, Rocket, Shield, Clock, Bell, Flame, Smile, Sparkles, Repeat, Circle,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

type IconComponent = FC<LucideProps>

export interface IconGroup {
  label: string
  icons: Record<string, IconComponent>
}

/**
 * The picker's tabs, in order. Stored icon names are the keys, so an icon can move between groups
 * freely, but renaming or removing one leaves categories and lists that use it on their fallback.
 */
export const ICON_GROUPS: IconGroup[] = [
  { label: 'Health', icons: { Heart, HeartPulse, Activity, Dumbbell, Bike, Footprints, Volleyball, Timer, Wind, Pill, Stethoscope, Syringe, Bandage, Eye, Glasses } },
  { label: 'Work', icons: { Briefcase, Laptop, Calendar, CalendarCheck, AlarmClock, Hourglass, ClipboardList, Clipboard, ListChecks, ListTodo, Kanban, Presentation, Target, FileText, Pen, Inbox, Mail, Send, Archive, Folder, Paperclip } },
  { label: 'Money', icons: { DollarSign, Coins, Banknote, CreditCard, Wallet, PiggyBank, TrendingUp, ChartPie, Percent, Receipt, Calculator, Landmark } },
  { label: 'Learning', icons: { BookOpen, GraduationCap, Brain, Bookmark, Lightbulb, Library, Languages, Microscope, FlaskConical, Newspaper } },
  { label: 'People', icons: { Users, Baby, Handshake, HeartHandshake, MessageSquare, Phone, Gift, PartyPopper, Cake, Church, Dog, Cat, PawPrint } },
  { label: 'Home', icons: { Home, Bed, Bath, Sofa, Lamp, WashingMachine, Plug, Hammer, Drill, Wrench, Paintbrush, Brush, Scissors, Shirt, Recycle, Key, Lock } },
  { label: 'Food', icons: { UtensilsCrossed, CookingPot, Coffee, Apple, Salad, Carrot, Egg, Croissant, Sandwich, Soup, Pizza, IceCreamCone, Cherry, Wine, Beer } },
  { label: 'Shopping', icons: { ShoppingCart, ShoppingBag, Store, Package, Truck } },
  { label: 'Travel', icons: { Car, Bus, TrainFront, Plane, Ship, Sailboat, Anchor, Fuel, Map, MapPin, Compass, Luggage, Hotel, Ticket, Tent, Globe } },
  { label: 'Fun', icons: { Music, Film, Tv, Gamepad2, Headphones, Mic, Guitar, Camera, Palette, Drama, Puzzle, Dices, Swords } },
  { label: 'Nature', icons: { Leaf, Sprout, Flower, Flower2, Clover, TreePine, Mountain, Sun, Moon, Cloud, CloudRain, Rainbow, Snowflake, Umbrella, Droplet, Zap, Bird, Fish, Rabbit } },
  { label: 'Tech', icons: { Smartphone, Monitor, Keyboard, Printer, Cpu, HardDrive, Wifi, Code2, Terminal, Bug, Bot, Headset } },
  { label: 'General', icons: { Star, Flag, Trophy, Medal, Award, Crown, Gem, Rocket, Shield, Clock, Bell, Flame, Smile, Sparkles, Repeat, Circle } },
]

export const ICON_MAP: Record<string, IconComponent> = Object.assign({}, ...ICON_GROUPS.map((g) => g.icons))

export function CategoryIcon({
  icon,
  color,
  size = 14,
  strokeWidth = 2,
}: {
  icon: string | null | undefined
  color: string
  size?: number
  strokeWidth?: number
}) {
  if (!icon) return <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
  const Icon = ICON_MAP[icon]
  if (!Icon) return <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
  return <Icon style={{ color, width: size, height: size, flexShrink: 0 }} strokeWidth={strokeWidth} />
}
