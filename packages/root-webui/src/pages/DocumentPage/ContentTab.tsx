interface ContentTabProps {}

export function ContentTab(props: ContentTabProps) {
  return <>Content Tab Content</>;
}

interface ContentTabPreviewProps {}

ContentTab.Preview = (props: ContentTabPreviewProps) => {
  return <>Content Preview</>;
};
