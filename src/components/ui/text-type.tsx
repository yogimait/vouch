"use client";

/**
 * React Bits' TextType, minus gsap: upstream pulls the whole animation library in to blink one
 * caret, which a two-line CSS keyframe already does. Colour and reverse props dropped — nothing
 * here uses them, and emphasis in this design is the `.em` utility, not a per-string colour.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";

interface TextTypeProps {
  text: string | string[];
  as?: ElementType;
  className?: string;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: string;
  cursorClassName?: string;
  /** Jitters each keystroke, which is what stops it reading as a metronome. */
  variableSpeed?: { min: number; max: number };
  startOnVisible?: boolean;
}

export function TextType({
  text,
  as: Component = "span",
  className = "",
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = "|",
  cursorClassName = "",
  variableSpeed,
  startOnVisible = false,
  ...props
}: TextTypeProps & React.HTMLAttributes<HTMLElement>) {
  const [displayed, setDisplayed] = useState("");
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [visible, setVisible] = useState(!startOnVisible);
  const containerRef = useRef<HTMLElement>(null);

  const texts = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);
  const current = texts[textIndex] ?? "";

  const nextSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    return Math.random() * (variableSpeed.max - variableSpeed.min) + variableSpeed.min;
  }, [variableSpeed, typingSpeed]);

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { threshold: 0.1 },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!visible) return;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (deleting) {
        if (displayed === "") {
          setDeleting(false);
          if (textIndex === texts.length - 1 && !loop) return;
          setTextIndex((prior) => (prior + 1) % texts.length);
          setCharIndex(0);
          return;
        }
        timeout = setTimeout(() => setDisplayed((prior) => prior.slice(0, -1)), deletingSpeed);
        return;
      }
      if (charIndex < current.length) {
        timeout = setTimeout(() => {
          setDisplayed((prior) => prior + current[charIndex]);
          setCharIndex((prior) => prior + 1);
        }, nextSpeed());
        return;
      }
      // One string and no loop is a one-shot reveal: stop rather than delete what was just typed.
      if (!loop && textIndex === texts.length - 1) return;
      timeout = setTimeout(() => setDeleting(true), pauseDuration);
    };

    if (charIndex === 0 && !deleting && displayed === "") timeout = setTimeout(tick, initialDelay);
    else tick();

    return () => clearTimeout(timeout);
  }, [charIndex, current, deleting, deletingSpeed, displayed, initialDelay, loop, nextSpeed, pauseDuration, textIndex, texts, visible]);

  const hideCursor = hideCursorWhileTyping && (charIndex < current.length || deleting);

  // JSX rather than createElement: a ref inside a props object trips react-hooks/refs, which cannot
  // tell it from a ref being read during render.
  return (
    <Component ref={containerRef} className={`inline whitespace-pre-wrap ${className}`} {...props}>
      {displayed}
      {showCursor && !hideCursor && (
        <span aria-hidden className={`caret ml-1 inline-block ${cursorClassName}`}>
          {cursorCharacter}
        </span>
      )}
    </Component>
  );
}
