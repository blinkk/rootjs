import type {NextPage} from 'next';
import Head from 'next/head';
import {Container} from '../../src/components/Container/Container';
import styles from '../../styles/BlogPostPage.module.css';

const BlogPostPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>Blog Post</title>
      </Head>
      <Container>
        <div className={styles.hero}>
          <h1>Blog Post.</h1>
        </div>
      </Container>
    </>
  );
};

export default BlogPostPage;
