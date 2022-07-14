import type {NextPage} from 'next';
import Head from 'next/head';
import Image from 'next/image';
import {BlogCard} from '../src/components/BlogCard/BlogCard';
import {Container} from '../src/components/Container/Container';
import styles from '../styles/Home.module.css';

const Home: NextPage = () => {
  const post = {
    url: '/blog/lorem-ipsum',
    meta: {
      title: 'Lorem ipsum',
      description: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    },
    status: {
      publishedAt: '2022-05-14',
    },
  };
  return (
    <>
      <Head>
        <title>Blog</title>
      </Head>
      <Container>
        <div className={styles.hero}>
          <h1>Blog.</h1>
        </div>
        <div className={styles.featured}>
          <BlogCard featured={true} post={post} />
        </div>
        <div className={styles.cards}>
          <BlogCard post={post} />
          <BlogCard post={post} />
          <BlogCard post={post} />
          <BlogCard post={post} />
          <BlogCard post={post} />
          <BlogCard post={post} />
        </div>
        <div className={styles.footer} />
      </Container>
    </>
  );
};

export default Home;
