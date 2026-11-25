import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => <Base {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></Base>;
export const PauseIcon = (p: IconProps) => <Base {...p}><path d="M8 5v14M16 5v14" strokeWidth={2.6} /></Base>;
export const StopIcon = (p: IconProps) => <Base {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" /></Base>;
export const LoopIcon = (p: IconProps) => <Base {...p}><path d="M17 2.5 20.5 6 17 9.5" /><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" /><path d="M7 21.5 3.5 18 7 14.5" /><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" /></Base>;
export const UndoIcon = (p: IconProps) => <Base {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Base>;
export const RedoIcon = (p: IconProps) => <Base {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Base>;
export const ResetIcon = (p: IconProps) => <Base {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Base>;
export const ArrowUpIcon = (p: IconProps) => <Base {...p}><path d="m6 11 6-6 6 6M12 5v14" /></Base>;
export const ArrowDownIcon = (p: IconProps) => <Base {...p}><path d="m6 13 6 6 6-6M12 19V5" /></Base>;
export const ArrowLeftIcon = (p: IconProps) => <Base {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Base>;
export const ArrowRightIcon = (p: IconProps) => <Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>;
export const CopyIcon = (p: IconProps) => <Base {...p}><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></Base>;
export const TrashIcon = (p: IconProps) => <Base {...p}><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" /></Base>;
export const PlusIcon = (p: IconProps) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const DownloadIcon = (p: IconProps) => <Base {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Base>;
export const UploadIcon = (p: IconProps) => <Base {...p}><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></Base>;
export const CheckIcon = (p: IconProps) => <Base {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Base>;
export const AlertIcon = (p: IconProps) => <Base {...p}><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.3" /></Base>;
export const InfoIcon = (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.3" /></Base>;
export const ClockIcon = (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Base>;
export const NoteIcon = (p: IconProps) => <Base {...p}><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></Base>;
export const SearchIcon = (p: IconProps) => <Base {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Base>;
export const MenuIcon = (p: IconProps) => <Base {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Base>;
export const CloseIcon = (p: IconProps) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const VolumeIcon = (p: IconProps) => <Base {...p}><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></Base>;
export const ZoomInIcon = (p: IconProps) => <Base {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6M11 8v6" /></Base>;
export const ScissorsIcon = (p: IconProps) => <Base {...p}><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8.2 20 18M8 15.8 20 6" /></Base>;
export const FileIcon = (p: IconProps) => <Base {...p}><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M14 3.5v5h5" /></Base>;
export const PackageIcon = (p: IconProps) => <Base {...p}><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></Base>;
export const LinkIcon = (p: IconProps) => <Base {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></Base>;
export const UserIcon = (p: IconProps) => <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.5-3.7 4.4-5.5 8-5.5s6.5 1.8 8 5.5" /></Base>;
export const HeadphonesIcon = (p: IconProps) => <Base {...p}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14" width="4" height="6.5" rx="1.5" /><rect x="16.5" y="14" width="4" height="6.5" rx="1.5" /></Base>;
