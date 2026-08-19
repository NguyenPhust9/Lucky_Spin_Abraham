/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2563EB',
          darkblue: '#1D4ED8',
          deep: '#0f172a',
          coral: '#F43F5E',
          coralhover: '#FB7185',
          orange: '#ff5722',
          orangehover: '#f4511e',
          yellow: '#FBBF24'
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif']
      },
      boxShadow: {
        'cta': '0 10px 25px -5px rgba(37, 99, 235, 0.35), 0 8px 10px -6px rgba(244, 63, 94, 0.25)',
        'cta-hover': '0 20px 30px -10px rgba(37, 99, 235, 0.45), 0 10px 12px -5px rgba(244, 63, 94, 0.3)',
        'card': '0 10px 30px -5px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
}