import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText, Image as ImageIcon, X } from "lucide-react";

type Props = {
  paths: string[];
  onRemove?: (path: string) => void;
};

function isImage(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(path);
}
function basename(path: string) {
  const segs = path.split("/");
  return segs[segs.length - 1] ?? path;
}

export function AttachmentList({ paths, onRemove }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of paths) {
        const { data } = await supabase.storage.from("task-photos").createSignedUrl(p, 3600);
        if (data?.signedUrl) next[p] = data.signedUrl;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; };
  }, [paths]);

  if (paths.length === 0) return null;

  return (
    <div className="space-y-2">
      {paths.map((p) => {
        const url = urls[p];
        const img = isImage(p);
        return (
          <div key={p} className="flex items-center gap-2 rounded border p-2">
            {img ? (
              url ? (
                <a href={url} target="_blank" rel="noopener" className="shrink-0">
                  <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
                </a>
              ) : (
                <div className="h-12 w-12 animate-pulse rounded bg-muted" />
              )
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1 truncate text-sm">{basename(p)}</div>
            {url && (
              <Button asChild size="sm" variant="ghost">
                <a href={url} target="_blank" rel="noopener" download>
                  {img ? <ImageIcon className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                </a>
              </Button>
            )}
            {onRemove && (
              <Button size="sm" variant="ghost" onClick={() => onRemove(p)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
