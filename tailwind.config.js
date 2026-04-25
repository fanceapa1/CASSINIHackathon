/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      colors: {
        ink: '#101725',
        surface: '#f2f6fc',
        accent: '#1387a8',
        coral: '#f9735b',
      },
      boxShadow: {
        soft: '0 24px 45px -30px rgba(10, 35, 66, 0.45)',
      },
    },
  },
  plugins: [],
};
