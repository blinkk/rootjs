import {IconFile} from '@tabler/icons-preact';
import './FileUploadField.css';
import {useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';

interface FileUploadFieldProps {
  icon: 'file' | 'image';
}

export function FileUploadField() {
  return (
    <div className="FileUploadField">
      <FileUploadField.Empty />
    </div>
  );
}

FileUploadField.Empty = (props: {icon?: 'file' | 'image'}) => {
  return (
    <div className="FileUploadField__Empty">
      <FileUploadField.Dropzone />
      <div className="FileUploadField__Empty__Label">
        <div>
          <label className="FileUploadField__Empty__Label__Text" tabindex={0}>
            <input
              type="file"
              accept="image/*,video/*"
              className="FileUploadField__Empty__Label__Text__Input"
            />
            <IconFile size={16} />
            <div className="FileUploadField__Empty__Label__Text__Title">
              Paste, drop, or click to upload
            </div>
          </label>
        </div>
      </div>
      <div>
        <div className="FileUploadField__Empty__AcceptTypes">
          Accepts mp4, jpg, png
        </div>
      </div>
    </div>
  );
};

FileUploadField.Dropzone = () => {
  const [dragging, setDragging] = useState(false);
  return (
    <button
      className={joinClassNames(
        'FileUploadField__Dropzone',
        dragging && 'FileUploadField__Dropzone--dragging'
      )}
      onDragOver={(e) => {
        console.log('Drag over');
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        console.log('Drag leave');
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        console.log('File dropped:', e.dataTransfer.files);
        e.preventDefault();
        setDragging(false);
        // Handle file upload logic here
      }}
      onPaste={(e) => {
        e.preventDefault();
        const file = e.clipboardData.files[0];
        if (file) {
          console.log('File pasted:', file);
          // Handle file upload logic here
        }
      }}
      title="Drop or paste to upload a file"
    ></button>
  );
};
