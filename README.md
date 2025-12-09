# BooruRamen 🍜

![BooruRamen Logo](./src/assets/logo-placeholder.png)

> A personalized image browsing application with smart recommendations

## 📋 Overview

BooruRamen is a Vue.js application that provides a personalized image and video browsing experience. It features a sophisticated recommendation system inspired by ByteDance's Monolith algorithm that learns from your interactions to show content tailored to your preferences.

### Key Features

- **Smart Recommendations**: Content recommendations improve as you interact with the app (likes, dislikes, time spent).
- **Profile Analytics**: Detailed insights into your viewing habits, including top tags, engagement rates, and video watch time.
- **Personal Preferences**: Your preferences and history are stored locally for privacy.
- **Tag-based Filtering**: Easily discover content using tag-based searches with support for whitelists and blacklists.
- **Responsive Design**: Works on desktop and mobile devices with adaptive layouts.

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn

### Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/BooruRamen.git
cd BooruRamen
```

2. Install dependencies:
```
npm install
```

3. Start the development server:
```
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:5173
```

## 🛠️ Building for Production

Compile and minify for production:
```
npm run build
```

The built files will be in the `dist/` directory, ready for deployment.

## 🧰 Technologies Used

- **Vue.js 3**: Frontend framework
- **Vite**: Next Generation Frontend Tooling
- **Tailwind CSS**: Styling and UI components
- **Vue Router**: Client-side routing
- **Lucide Vue Next**: Beautiful & consistent icons
- **Local Storage API**: For data persistence (No external database required)

## 📊 Profile Analytics

Gain insights into your preferences with the dedicated Analytics page:
- **Top Tags & Pairs**: See which content you engage with most.
- **Engagement Metrics**: Track Like and Favorite rates normalized by views.
- **Most Disliked**: Identify tags you frequently dislike to refine recommendations.
- **Video Analytics**: Monitor your total video watch time and average viewing duration.
- **Visualizations**: View tag distributions via responsive SVG-based charts.

## 🧠 Recommendation System

BooruRamen uses a sophisticated recommendation system that:

- Analyzes your browsing patterns
- Learns from your explicit likes and dislikes
- Builds a personalized content profile
- Delivers a unique feed based on your preferences

All recommendations are processed locally in your browser for privacy.

## 📷 Screenshots

![Home Screen](./screenshots/home-placeholder.png)
*Home Screen with personalized recommendations*

![Browse View](./screenshots/browse-placeholder.png)
*Browse interface with tag filtering*

![Settings](./screenshots/settings-placeholder.png)
*Customizable user settings*

## 🧩 Project Structure

```
src/
  ├── assets/          # Static assets
  ├── components/      # Reusable Vue components (BottomNavBar, etc.)
  ├── router/          # Route definitions
  ├── services/        # Service modules
  │   ├── RecommendationSystem.js  # Content recommendation engine
  │   ├── StorageService.js        # Local storage & analytics data management
  │   └── DanbooruService.js       # External API integration
  ├── views/           # Page views
  │   ├── FeedView.vue             # Main content feed
  │   ├── PostViewerView.vue       # Immersive media viewer
  │   ├── ProfileView.vue          # User profile hub
  │   └── ProfileAnalyticsView.vue # Detailed analytics dashboard
  └── App.vue          # Main application component
```

## 🧪 Linting and Testing

Run linting checks:
```
npm run lint
```

## 👩‍💻 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the [MIT License](LICENSE)

---

Created with ❤️ for image browsing enthusiasts
