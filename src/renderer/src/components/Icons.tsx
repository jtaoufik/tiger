/**
 * Tiger's icon set, backed by Lucide (https://lucide.dev) — a clean, consistent
 * stroke library that matches the app's design (24px grid, rounded caps). We
 * re-export under stable local names so call sites never reference Lucide
 * directly, and apply a slightly lighter 1.8 stroke to fit the UI weight.
 *
 * Always import icons from here. Never use emoji or unicode glyphs as icons.
 */
import {
  ArrowDown,
  ArrowRightToLine,
  ArrowUp,
  BookOpen,
  Box,
  Bug,
  ChevronDown,
  CircleQuestionMark,
  Ellipsis,
  FolderPlus,
  Keyboard,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  PanelLeft,
  Sun,
  Check,
  CircleX,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  ListX,
  Locate,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Square,
  ArrowRightLeft,
  Trash2,
  TriangleAlert,
  Upload,
  WrapText,
  X,
  type LucideIcon,
  type LucideProps
} from 'lucide-react'
import { CircleCheck, CircleDashed, CloudUpload, History, Laptop, Undo2, Users } from 'lucide-react'
import { Eraser, Plug, Radio, Send, Unplug } from 'lucide-react'

export type IconProps = LucideProps & { size?: number }

/** Defaults applied to every icon; call-site props override them. */
const base = (Comp: LucideIcon) => {
  const Wrapped = ({ size = 16, ...rest }: IconProps) => (
    <Comp size={size} strokeWidth={1.8} aria-hidden {...rest} />
  )
  return Wrapped
}

export const ChevronIcon = base(ChevronRight)
export const BoxIcon = base(Box)
export const FolderIcon = base(Folder)
export const FolderOpenIcon = base(FolderOpen)
export const FileIcon = base(FileText)
export const GearIcon = base(Settings)
export const ClockIcon = base(Clock)
export const GlobeIcon = base(Globe)
export const SwapIcon = base(ArrowRightLeft)
export const CodeIcon = base(Code)
export const CloseIcon = base(X)
export const PlusIcon = base(Plus)
export const TrashIcon = base(Trash2)
export const SearchIcon = base(Search)
export const CopyIcon = base(Copy)
export const CheckIcon = base(Check)
export const PencilIcon = base(Pencil)
export const PlayIcon = base(Play)
export const StopIcon = base(Square)
export const DownloadIcon = base(Download)
export const UploadIcon = base(Upload)
export const GitBranchIcon = base(GitBranch)
export const RefreshIcon = base(RefreshCw)
export const ArrowUpIcon = base(ArrowUp)
export const ArrowRightToLineIcon = base(ArrowRightToLine)
export const XCircleIcon = base(CircleX)
export const ListXIcon = base(ListX)
export const LocateIcon = base(Locate)
export const ArrowDownIcon = base(ArrowDown)
export const WrapIcon = base(WrapText)
export const EyeIcon = base(Eye)
export const EyeOffIcon = base(EyeOff)
export const GaugeIcon = base(Gauge)
export const SaveIcon = base(Save)
export const WarningIcon = base(TriangleAlert)
export const HelpIcon = base(CircleQuestionMark)
export const MoreIcon = base(Ellipsis)
export const FolderPlusIcon = base(FolderPlus)
export const KeyboardIcon = base(Keyboard)
export const LockIcon = base(Lock)
export const LockOpenIcon = base(LockOpen)
export const SidebarIcon = base(PanelLeft)
export const SunIcon = base(Sun)
export const MoonIcon = base(Moon)
export const MonitorIcon = base(Monitor)
export const BookIcon = base(BookOpen)
export const BugIcon = base(Bug)
export const ChevronDownIcon = base(ChevronDown)

// Team sync (git) status and actions.
export const CircleDashedIcon = base(CircleDashed)
export const CircleCheckIcon = base(CircleCheck)
export const LaptopIcon = base(Laptop)
export const UsersIcon = base(Users)
export const UndoIcon = base(Undo2)
export const CloudUploadIcon = base(CloudUpload)
export const HistoryIcon = base(History)
export const PlugIcon = base(Plug)
export const UnplugIcon = base(Unplug)
export const SendIcon = base(Send)
export const RadioIcon = base(Radio)
export const EraserIcon = base(Eraser)
