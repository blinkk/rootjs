export function PlaceholderModal() {
  return (<Modal
          opened={placeholderModalOpened}
          onClose={() => setPlaceholderModalOpened(false)}
          title="Placeholder"
          centered
          overlayColor={
            theme.colorScheme === 'dark'
              ? theme.colors.dark[9]
              : theme.colors.gray[2]
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const width = parseInt(formData.get('width') as string, 10);
              const height = parseInt(formData.get('height') as string, 10);
              const label = formData.get('label') as string;
  
              let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ccc" />`;
              if (label) {
                svg += `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#333">${label}</text>`;
              }
              svg += '</svg>';
  
              const encoder = new TextEncoder();
              const uint8Array = encoder.encode(svg);
              const src = `data:image/svg+xml;base64,${btoa(
                String.fromCharCode(...uint8Array)
              )}`;
              const placeholderFile: UploadedFile = {
                src: src,
                filename: 'placeholder.svg',
                width: width,
                height: height,
                alt: label || 'Placeholder image',
              };
              setFileData(placeholderFile);
              setPlaceholderModalOpened(false);
            }}
          >
            <Table>
              <tbody>
                <tr>
                  <td>
                    <label htmlFor="placeholder-width">Width</label>
                  </td>
                  <td>
                    <input
                      id="placeholder-width"
                      name="width"
                      type="number"
                      defaultValue={1600}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="placeholder-height">Height</label>
                  </td>
                  <td>
                    <input
                      id="placeholder-height"
                      name="height"
                      type="number"
                      defaultValue={900}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="placeholder-label">Label</label>
                  </td>
                  <td>
                    <input id="placeholder-label" name="label" type="text" />
                  </td>
                </tr>
              </tbody>
            </Table>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button type="submit">Create</button>
            </div>
          </form>
        </Modal> )  ;
