import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

type Props = {
  paths: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImageGallery({ paths, open, onOpenChange }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, paths]);

  function download(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {active === null ? (
          <div>
            <h3 className="mb-3 font-semibold">图片 ({paths.length})</h3>
            {paths.length === 0 && <p className="text-sm text-muted-foreground">无图片</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {paths.map((p, i) => (
                <button
                  key={p}
                  onClick={() => setActive(i)}
                  className="aspect-square overflow-hidden rounded border bg-muted"
                >
                  {urls[p] ? (
                    <img src={urls[p]} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-muted" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{active + 1} / {paths.length}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => download(urls[paths[active]])}>
                  <Download className="mr-1 h-4 w-4" /> 下载
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setActive(null)}>
                  <X className="mr-1 h-4 w-4" /> 关闭
                </Button>
              </div>
            </div>
            <div className="relative flex items-center justify-center bg-muted/30 rounded">
              {urls[paths[active]] && (
                <img src={urls[paths[active]]} alt="" className="max-h-[70vh] w-auto object-contain" />
              )}
            </div>
            <div className="flex justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={active === 0}
                onClick={() => setActive((i) => (i! > 0 ? i! - 1 : i))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> 上一张
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={active === paths.length - 1}
                onClick={() => setActive((i) => (i! < paths.length - 1 ? i! + 1 : i))}
              >
                下一张 <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
