import { createRouter, createWebHistory } from 'vue-router';
import FeedView from '../views/FeedView.vue';
import HistoryView from '../views/HistoryView.vue';
import LikesView from '../views/LikesView.vue';
import FavoritesView from '../views/FavoritesView.vue';
import PostViewerView from '../views/PostViewerView.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: FeedView,
  },
  {
    path: '/history',
    name: 'History',
    component: HistoryView,
  },
  {
    path: '/likes',
    name: 'Likes',
    component: LikesView,
  },
  {
    path: '/favorites',
    name: 'Favorites',
    component: FavoritesView,
  },
  {
    path: '/view/:source',
    name: 'Viewer',
    component: PostViewerView,
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router; 