const BASE_URL = 'https://danbooru.donmai.us';

const getPosts = async ({ tags, page, limit, sort, sortOrder }) => {
  const hasOrder = tags.includes('order:');
  const params = new URLSearchParams({
    tags: hasOrder ? tags : `${tags} order:${sort === 'score' ? 'score' : 'id'}:${sortOrder}`,
    page,
    limit,
  });

  const url = `${BASE_URL}/posts.json?${params.toString()}`;
  console.log('Danbooru Fetch:', url);

  try {
    const response = await fetch(url);
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