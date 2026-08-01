import {
  ArrowDownCircle, ArrowDownToLine, ArrowLeftRight, ArrowUpCircle, Award,
  Banknote, BarChart3, BookOpen, Boxes, Brain, Building2, Calendar, CheckCheck,
  Circle, ClipboardList, Clock, Coins, CreditCard, Eye, FilePlus, FileSignature,
  FileText, FileWarning, Filter, FolderArchive, FolderTree, Gift, GitBranch,
  GitCompare, HandCoins, HeartPulse, Home, Inbox, KeyRound, Landmark, Layers,
  LayoutDashboard, LayoutGrid, LineChart, ListChecks, LogOut, MailPlus,
  MessageCircle, MessageSquare, MessageSquareWarning, Monitor, Package,
  PackageOpen, Palmtree, Percent, PieChart, Radar, Receipt, Rocket, Route, Send,
  Settings, Shield, ShieldAlert, ShieldCheck, ShoppingBag, ShoppingCart, Sliders,
  Sparkles, StickyNote, TableProperties, Target, TrendingUp, Truck, Tv, Upload,
  User, UserCog, UserPlus, Users, UserSearch, UsersRound, Wallet, Warehouse,
  type LucideIcon,
} from "lucide-react";

/**
 * Mapa nome -> componente, para os ícones guardados como texto na coluna
 * sncf_navegacao.icone. Cobre os 78 nomes em uso no banco hoje.
 * Ícone desconhecido cai em Circle em vez de quebrar a tela (FAIL-SOFT aqui é
 * proposital: menu sem ícone é aceitável, menu que não renderiza não é).
 */
export const ICONES_NAVEGACAO: Record<string, LucideIcon> = {
  ArrowDownCircle, ArrowDownToLine, ArrowLeftRight, ArrowUpCircle, Award,
  Banknote, BarChart3, BookOpen, Boxes, Brain, Building2, Calendar, CheckCheck,
  ClipboardList, Clock, Coins, CreditCard, Eye, FilePlus, FileSignature,
  FileText, FileWarning, Filter, FolderArchive, FolderTree, Gift, GitBranch,
  GitCompare, HandCoins, HeartPulse, Home, Inbox, KeyRound, Landmark, Layers,
  LayoutDashboard, LayoutGrid, LineChart, ListChecks, LogOut, MailPlus,
  MessageCircle, MessageSquare, MessageSquareWarning, Monitor, Package,
  PackageOpen, Palmtree, Percent, PieChart, Radar, Receipt, Rocket, Route, Send,
  Settings, Shield, ShieldAlert, ShieldCheck, ShoppingBag, ShoppingCart, Sliders,
  Sparkles, StickyNote, TableProperties, Target, TrendingUp, Truck, Tv, Upload,
  User, UserCog, UserPlus, Users, UserSearch, UsersRound, Wallet, Warehouse,
};

export function iconeDe(nome: string | null | undefined): LucideIcon {
  if (!nome) return Circle;
  return ICONES_NAVEGACAO[nome] ?? Circle;
}
