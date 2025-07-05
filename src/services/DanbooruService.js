const BASE_URL = 'https://danbooru.donmai.us';

const getPosts = async ({ tags, page, limit, sort, sortOrder }) => {
  const params = new URLSearchParams({
    tags: `${tags} order:${sort === 'score' ? 'score' : 'id'}:${sortOrder}`,
    page,
    limit,
  });

  try {
    const response = await fetch(`${BASE_URL}/posts.json?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.filter(post => post.id && post.file_url);
  } catch (error) {
    console.error('Error fetching posts from Danbooru:', error);
    return [];
  }
};

export default {
  getPosts,
}; 