import Link from "next/link";
import { LogoMark } from "@/components/chrome/Header";

/** Any address that isn't a page: the logo and a line of text, centred. */
export default function NotFound() {
  return (
    <main
      id="main"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-4)",
        padding: "var(--space-5)",
        textAlign: "center",
        background: "var(--bg)",
      }}
    >
      <title>Page not found · EMBERA</title>
      <Link href="/" aria-label="EMBERA home">
        <LogoMark size={96} />
      </Link>
      <h1 className="page-title">There&apos;s no page here</h1>
      <p className="page-lede">
        <Link href="/" style={{ color: "var(--accent)" }}>
          Go to the overview
        </Link>
      </p>
    </main>
  );
}
