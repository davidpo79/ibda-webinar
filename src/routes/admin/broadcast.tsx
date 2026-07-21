import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAdminBroadcastPackageOptions,
  previewBroadcastAudienceAction,
  sendBroadcastTestAction,
  sendBroadcastEmailAction,
} from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/broadcast")({
  head: () => ({
    meta: [{ title: "שליחת מייל · אדמין · IBDA" }],
  }),
  loader: async () => {
    try {
      return await getAdminBroadcastPackageOptions();
    } catch {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminBroadcastPage,
});

type Source = "leads" | "buyers" | "all";

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "leads", label: "לידים (כל מי שנרשם)" },
  { value: "buyers", label: "רוכשים (שילמו בפועל)" },
  { value: "all", label: "הכל" },
];

type Attachment = { filename: string; contentBase64: string; size: number };

const MAX_ATTACHMENTS_BYTES = 35 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — Resend's attachment
      // `content` field wants the raw base64 payload only.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminBroadcastPage() {
  const { packages } = Route.useLoaderData();
  const editorRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<Source>("leads");
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [testEmail, setTestEmail] = useState("");

  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    total: number;
    skippedUnsubscribed: number;
  } | null>(null);

  const packageIds = useMemo(() => Array.from(selectedPackages), [selectedPackages]);
  const attachmentsSize = attachments.reduce((sum, a) => sum + a.size, 0);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await previewBroadcastAudienceAction({ data: { source, packageIds } });
        if (!cancelled) setPreview(data);
      } catch (err) {
        console.error("[admin/broadcast] preview failed", err);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, packageIds.join(",")]);

  function togglePackage(id: string) {
    setSelectedPackages((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function insertLink() {
    const url = window.prompt("כתובת URL:");
    if (url) exec("createLink", url);
  }

  function insertImageByUrl() {
    const url = window.prompt("כתובת URL ציבורית של תמונה (https://...):");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("הכתובת חייבת להתחיל ב-http:// או https://");
      return;
    }
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<div dir="rtl" style="text-align:center;margin:14px 0;"><img src="${url}" style="display:block;margin:0 auto;width:100%;max-width:520px;height:auto;" alt="" /></div><p></p>`,
    );
  }

  async function onAddFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const currentTotal = attachmentsSize;
    const newTotal = currentTotal + files.reduce((sum, f) => sum + f.size, 0);
    if (newTotal > MAX_ATTACHMENTS_BYTES) {
      toast.error(`סך כל הקבצים המצורפים חייב להיות מתחת ל-${formatBytes(MAX_ATTACHMENTS_BYTES)}`);
      return;
    }
    try {
      const added = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          contentBase64: await readFileAsBase64(f),
          size: f.size,
        })),
      );
      setAttachments((prev) => [...prev, ...added]);
    } catch (err) {
      console.error("[admin/broadcast] file read failed", err);
      toast.error("קריאת אחד הקבצים נכשלה");
    }
  }

  function removeAttachment(filename: string) {
    setAttachments((prev) => prev.filter((a) => a.filename !== filename));
  }

  function currentComposeData() {
    return {
      subject: subject.trim(),
      bodyHtml: editorRef.current?.innerHTML ?? "",
      ctaText: ctaText.trim(),
      ctaUrl: ctaUrl.trim(),
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentBase64: a.contentBase64,
      })),
    };
  }

  function validateCompose(): boolean {
    if (!subject.trim()) {
      toast.error("חסר נושא למייל");
      return false;
    }
    const body = editorRef.current?.innerHTML ?? "";
    if (!body.trim() || body.trim() === "<br>") {
      toast.error("חסר תוכן למייל");
      return false;
    }
    return true;
  }

  async function onSendTest() {
    if (!validateCompose()) return;
    if (!testEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail.trim())) {
      toast.error("כתובת מייל לבדיקה לא תקינה");
      return;
    }
    setSendingTest(true);
    try {
      await sendBroadcastTestAction({
        data: { ...currentComposeData(), testEmail: testEmail.trim() },
      });
      toast.success(`נשלח מייל בדיקה ל-${testEmail.trim()}`);
    } catch (err) {
      console.error("[admin/broadcast] test send failed", err);
      toast.error("שליחת הבדיקה נכשלה");
    } finally {
      setSendingTest(false);
    }
  }

  async function onSendBroadcast() {
    if (!validateCompose()) return;
    const count = preview?.count ?? 0;
    if (count === 0) {
      toast.error("אין נמענים תואמים לסינון שנבחר");
      return;
    }
    if (
      !window.confirm(
        `לשלוח ל-${count} נמענים?\n\nנושא: ${subject.trim()}\n\nהפעולה תשלח מיילים אמיתיים ואינה ניתנת לביטול.`,
      )
    ) {
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const data = await sendBroadcastEmailAction({
        data: { ...currentComposeData(), source, packageIds },
      });
      setResult(data);
      toast.success(
        `נשלח ל-${data.sent} מתוך ${data.total}${data.failed ? `, ${data.failed} נכשלו` : ""}`,
      );
    } catch (err) {
      console.error("[admin/broadcast] send failed", err);
      toast.error("השליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream font-sans" dir="rtl">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-gold">שליחת מייל</h1>
        <Link to="/admin" className="text-sm text-muted-brown hover:text-gold transition-colors">
          חזרה למסך הראשי
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <p className="text-muted-brown text-sm leading-relaxed">
          שליחת מייל חד-פעמי לקבוצת נמענים לפי מסלולים/מוצרים. מיילים ל"בדיקה" נשלחים רק לכתובת
          שתזינו למטה, בלי לגעת ברשימת הנמענים.
        </p>

        {/* Audience */}
        <section className="glass-gold rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-cream">קהל יעד</h2>
          <div className="flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSource(o.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                  source === o.value
                    ? "bg-gold/15 border-gold/50 text-gold"
                    : "bg-ink/40 border-cream/15 text-muted-brown hover:border-gold/40",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <span className="text-[12px] text-muted-brown mb-2 block">
              סינון לפי מסלול/מוצר (ריק = הכל)
            </span>
            <div className="flex flex-wrap gap-2">
              {packages.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePackage(p.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                    selectedPackages.has(p.value)
                      ? "bg-gold/15 border-gold/50 text-gold"
                      : "bg-ink/40 border-cream/15 text-muted-brown hover:border-gold/40",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-muted-brown">
            {previewLoading
              ? "טוען ספירת נמענים..."
              : preview
                ? `📬 ${preview.count} נמענים${
                    preview.sample.length
                      ? ` — לדוגמה: ${preview.sample.slice(0, 3).join(", ")}`
                      : ""
                  }`
                : "לא ניתן לטעון ספירת נמענים"}
          </div>
        </section>

        {/* Compose */}
        <section className="glass-gold rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-cream">תוכן המייל</h2>
          <label className="block">
            <span className="text-[12px] text-muted-brown mb-1 block">נושא</span>
            <input
              type="text"
              dir="rtl"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream text-right focus:outline-none focus:border-gold"
              placeholder="נושא המייל"
            />
          </label>

          <div>
            <span className="text-[12px] text-muted-brown mb-1 block">
              גוף המייל — אפשר להשתמש ב-[שם] כדי להטמיע את שם הנמען אוטומטית
            </span>
            <div className="flex flex-wrap gap-1 mb-2 border border-cream/15 rounded-t-md bg-ink/40 p-2">
              <ToolbarButton label="B" onClick={() => exec("bold")} />
              <ToolbarButton label="I" onClick={() => exec("italic")} />
              <ToolbarButton label="U" onClick={() => exec("underline")} />
              <ToolbarButton label="קישור" onClick={insertLink} />
              <ToolbarButton label="רשימה" onClick={() => exec("insertUnorderedList")} />
              <ToolbarButton label="תמונה מ-URL" onClick={insertImageByUrl} />
            </div>
            <div
              ref={editorRef}
              contentEditable
              dir="rtl"
              className="min-h-[220px] border border-cream/15 border-t-0 rounded-b-md bg-ink/20 px-3 py-3 text-sm text-cream text-right leading-relaxed focus:outline-none focus:border-gold [&_a]:text-gold [&_a]:underline"
              suppressContentEditableWarning
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[12px] text-muted-brown mb-1 block">
                טקסט כפתור CTA (אופציונלי)
              </span>
              <input
                type="text"
                dir="rtl"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream text-right focus:outline-none focus:border-gold"
                placeholder="למשל: הרשמה עכשיו"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-muted-brown mb-1 block">קישור הכפתור</span>
              <input
                type="text"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream ltr-inline focus:outline-none focus:border-gold"
                placeholder="https://..."
              />
            </label>
          </div>

          <div>
            <span className="text-[12px] text-muted-brown mb-1 block">
              קבצים מצורפים (עד {formatBytes(MAX_ATTACHMENTS_BYTES)} בסך הכל)
            </span>
            <input
              type="file"
              multiple
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.target.value = "";
              }}
              className="block text-sm text-muted-brown file:ml-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-gold/50 file:bg-transparent file:text-gold file:text-xs file:font-semibold"
            />
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((a) => (
                  <span
                    key={a.filename}
                    className="flex items-center gap-2 bg-ink/40 border border-cream/15 rounded-md px-3 py-1.5 text-xs"
                  >
                    {a.filename} · {formatBytes(a.size)}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.filename)}
                      className="text-destructive hover:underline"
                    >
                      הסרה
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Send */}
        <section className="glass-gold rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 min-w-[220px]">
              <span className="text-[12px] text-muted-brown mb-1 block">כתובת לבדיקה</span>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full bg-ink/40 border border-cream/15 rounded-md px-3 py-2 text-sm text-cream ltr-inline focus:outline-none focus:border-gold"
                placeholder="you@example.com"
              />
            </label>
            <button
              type="button"
              onClick={onSendTest}
              disabled={sendingTest}
              className="border border-cream/20 text-cream px-4 py-2 rounded-md text-sm font-semibold hover:bg-cream/10 transition-colors disabled:opacity-60"
            >
              {sendingTest ? "שולח..." : "שליחת בדיקה"}
            </button>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-cream/10">
            <button
              type="button"
              onClick={onSendBroadcast}
              disabled={sending}
              className="bg-gold text-ink px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-60"
            >
              {sending ? "שולח..." : `שליחה ל-${preview?.count ?? 0} נמענים`}
            </button>
            {result && (
              <span
                className={cn("text-sm", result.failed ? "text-destructive" : "text-green-400")}
              >
                נשלח: {result.sent} · נכשל: {result.failed} · סה"כ: {result.total}
                {result.skippedUnsubscribed
                  ? ` · דילגנו על ${result.skippedUnsubscribed} שהוסרו מהתפוצה`
                  : ""}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="px-2.5 py-1 rounded border border-cream/15 text-xs text-cream hover:border-gold/40 hover:text-gold transition-colors"
    >
      {label}
    </button>
  );
}
