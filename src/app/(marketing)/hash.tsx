"use client";

import DecryptedText from "@/components/ui/decrypted-text";

/**
 * The one thing on the landing page that decodes, and it decodes out of hex only. Nothing else
 * moves like this, which is what makes the digest read as the important field rather than decoration.
 */
export function Hash({ value }: { value: string }) {
  return (
    <div className="mt-1.5 font-mono text-[11px] leading-relaxed break-all text-fg-2">
      <DecryptedText
        text={value}
        animateOn="view"
        sequential
        speed={12}
        characters="0123456789abcdef"
        useOriginalCharsOnly={false}
        className="text-fg-2"
        encryptedClassName="text-fg-3"
      />
    </div>
  );
}
