/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0284c7',
          darkblue: '#0369a1',
          deep: '#0f172a',
          orange: '#ff5722',
          orangehover: '#f4511e',
          yellow: '#ffcc00'
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif']
      },
      boxShadow: {
        'cta': '0 10px 25px -5px rgba(255, 87, 34, 0.5), 0 8px 10px -6px rgba(255, 87, 34, 0.3)',
        'cta-hover': '0 20px 30px -10px rgba(255, 87, 34, 0.7), 0 10px 12px -5px rgba(255, 87, 34, 0.4)',
        'card': '0 10px 30px -5px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
}