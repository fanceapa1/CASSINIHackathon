// src/hooks/useScrambleText.js
import { useEffect, useRef } from "react";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const isLetterCharacter = (value) => /[A-Za-z]/.test(value);

export const useScrambleText = (elementRef, targetText, isActive, duration = 520) => {
  const requestRef = useRef(null);

  useEffect(() => {
    // If not active, ensure the element shows the correct text and exit
    if (!isActive || !elementRef.current) {
      if (elementRef.current) {
        elementRef.current.innerText = targetText;
      }
      return;
    }

    // Use performance.now() for smoother high-res timing
    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Animation complete
      if (progress >= 1) {
        elementRef.current.innerText = targetText;
        return;
      }

      // Calculate next scrambled string
      const nextValue = [...targetText]
        .map((char, index) => {
          if (!isLetterCharacter(char)) return char;

          const revealThreshold = Math.floor(progress * targetText.length);
          if (index <= revealThreshold) return char;

          const randomIndex = Math.floor(Math.random() * ALPHABET.length);
          const randomChar = ALPHABET[randomIndex];
          return char === char.toLowerCase() ? randomChar.toLowerCase() : randomChar;
        })
        .join("");

      // Mutate the DOM directly (Zero React re-renders!)
      elementRef.current.innerText = nextValue;

      // Request next frame
      requestRef.current = requestAnimationFrame(animate);
    };

    // Kick off animation
    requestRef.current = requestAnimationFrame(animate);

    // Cleanup function
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [elementRef, targetText, isActive, duration]);
};