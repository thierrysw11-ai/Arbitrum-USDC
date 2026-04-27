import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-500">
      <Loader2 size={28} className="animate-spin text-blue-500" />
      <span className="text-[11px] font-bold uppercase tracking-widest">
        Loading
      </span>
    </div>
  );
}
