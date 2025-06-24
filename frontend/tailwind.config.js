/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}', // If you ever use the pages directory
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'aurora': 'aurora 6s linear infinite',
      },
      keyframes: {
        aurora: {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
      },
      colors: {
        'light-glass-bg': 'rgba(245, 251, 247, 0.7)', // A semi-transparent version of light-green-start
        'dark-glass-bg': 'rgba(44, 47, 44, 0.6)', // A semi-transparent version of input-bg
        'light-green-start': '#A8D8B9', // For light theme gradient
        // Previous light theme colors (retained for now)
        'theme-green-light': '#A8D8B9',
        'theme-green-medium': '#88C8A0',
        'theme-green-dark': '#68B888',
        'glass-bg': 'rgba(255, 255, 255, 0.25)',

        // New dark theme colors from UI effect image
        'dark-bg': '#1A1D1A', // Very dark background
        'accent-green': '#3EFFAD', // Bright green for buttons/highlights
        'accent-green-darker': '#2CC685', // A slightly darker shade for hover/active
        'text-light': '#E0E0E0',     // Light gray for primary text
        'text-muted': '#A0A0A0',     // Muted gray for secondary text/borders
        'input-bg': '#2C2F2C',       // Background for input fields
        'dropzone-bg': '#252825',    // Background for the dropzone area
        'dropzone-border': '#4A4D4A', // Dashed border for dropzone
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'theme-gradient': 'linear-gradient(to right, #A8D8B9, #68B888)', // Example theme gradient
      },
      boxShadow: {
        '3d': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // Example for 3D effect
        '3d-light': '0 2px 3px -1px rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.03), 0 5px 8px -2px rgba(0, 0, 0, 0.05), 0 2px 3px -1px rgba(0, 0, 0, 0.02)',
      },
      backdropBlur: {
        'xs': '2px',
        'glass': '10px', // Example for glassmorphism
      },
      borderRadius: {
        'xl-3d': '1rem', // Example for 3D rounded corners
      }
    },
  },
  plugins: [
    // require('@tailwindcss/forms'), // Uncomment if you need form styling
    // You might add a plugin for more complex glassmorphism if needed
  ],
};
