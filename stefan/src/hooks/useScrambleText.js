import { useEffect, useRef, useState } from "react";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const isLetterCharacter = (value) => /[A-Za-z]/.test(value);

export const useScrambleText = (targetText, isActive, duration = 520) => {
  const [scrambledText, setScrambledText] = useState(targetText);
  const intervalRef = useRef(null);

  useEffect(() => {
    setScrambledText(targetText);
  }, [targetText]);

  useEffect(() => {
    if (!isActive) {
      setScrambledText(targetText);
      return undefined;
    }

    const startTime = Date.now();

    const clearExistingInterval = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    clearExistingInterval();

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1) {
        setScrambledText(targetText);
        clearExistingInterval();
        return;
      }

      const nextValue = [...targetText]
        .map((char, index) => {
          if (!isLetterCharacter(char)) {
            return char;
          }

          const revealThreshold = Math.floor(progress * targetText.length);

          if (index <= revealThreshold) {
            return char;
          }

          const randomIndex = Math.floor(Math.random() * ALPHABET.length);
          const randomChar = ALPHABET[randomIndex];
          return char === char.toLowerCase() ? randomChar.toLowerCase() : randomChar;
        })
        .join("");

      setScrambledText(nextValue);
    }, 24);

    return () => {
      clearExistingInterval();
    };
  }, [duration, isActive, targetText]);

  return scrambledText;
};
