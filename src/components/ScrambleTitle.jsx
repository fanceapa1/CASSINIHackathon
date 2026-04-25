import { useInView } from "framer-motion";
import { useRef } from "react";
import { useScrambleText } from "../hooks/useScrambleText";

const ScrambleTitle = ({ text, delay = 520, className, as: Component = "h2", once = false }) => {
    const ref = useRef(null);

    const isInView = useInView(ref, {
        once: once,
        margin: "-10% 0px",
        amount: 0.3
    });

    // Pass the ref to our new hook
    useScrambleText(ref, text, isInView, delay);

    return (
        <Component ref={ref} className={className}>
            {text}
        </Component>
    );
};

export default ScrambleTitle;