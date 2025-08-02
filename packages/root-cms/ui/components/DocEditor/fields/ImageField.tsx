import {ActionIcon, TextInput, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconPhotoUp, IconTrash} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useContext, useEffect, useRef, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {DraftController} from '../../../hooks/useDraft.js';
import {joinClassNames} from '../../../utils/classes.js';
import {UploadedFile, uploadFileToGCS} from '../../../utils/gcs.js';
import {
  FileUploadField,
  FileUploadFileContext,
} from '../../FileUploadField/FileUploadField.js';
import {FieldProps} from './FieldProps.js';

/** Mimetypes accepted by the image input field. */
const IMAGE_MIMETYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

/** Builds the `accept` attribute for the `input` field.*/
function buildAcceptAttribute(exts?: string[]) {
  return (exts ?? IMAGE_MIMETYPES).join(', ');
}

export function ImageField(props: FieldProps) {
  const field = props.field as schema.ImageField;
  const [img, setImg] = useState<any>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = buildAcceptAttribute(field.exts);

  // async function uploadFile(file: File) {
  //   setLoading(true);
  //   try {
  //     const uploadedImage = await uploadFileToGCS(file, {
  //       cacheControl: field.cacheControl,
  //     });
  //     setImg((currentImg: any) => {
  //       // Preserve the "alt" text when the image changes.
  //       const newImage = Object.assign({}, uploadedImage, {
  //         alt: currentImg?.alt || '',
  //       });
  //       props.draft.updateKey(props.deepKey, newImage);
  //       return newImage;
  //     });
  //     setLoading(false);
  //   } catch (err) {
  //     console.error('image upload failed');
  //     console.error(err);
  //     setLoading(false);
  //     showNotification({
  //       title: 'Image upload failed',
  //       message: 'Failed to upload image: ' + String(err),
  //       color: 'red',
  //       autoClose: false,
  //     });
  //   }

  //   // Reset the input element in case the user wishes to re-upload the image.
  //   if (inputRef.current) {
  //     const inputEl = inputRef.current;
  //     inputEl.value = '';
  //   }
  // }

  // function onFileChange(e: Event) {
  //   const inputEl = e.target as HTMLInputElement;
  //   const files = inputEl.files || [];
  //   const file = files[0];
  //   if (file) {
  //     uploadFile(file);
  //   }
  // }

  // function setAltText(newValue: string) {
  //   setImg((currentImg: any) => {
  //     return Object.assign({}, currentImg, {alt: newValue});
  //   });
  //   props.draft.updateKey(`${props.deepKey}.alt`, newValue);
  // }

  // function removeImage() {
  //   setImg({});
  //   props.draft.removeKey(props.deepKey);
  // }

  return (
    <ImageField.FileUpload
      file={img?.src?.length > 0 ? (img as UploadedFile) : undefined}
      deepKey={props.deepKey}
      draft={props.draft}
    />
  );
}

ImageField.FileUpload = (props: {
  deepKey: string;
  draft: DraftController;
  file?: UploadedFile | null;
}) => {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newUploadedFile: UploadedFile | null) => {
        setUploadedFile(newUploadedFile);
      }
    );
    return () => {
      unsubscribe();
    };
  }, []);
  return (
    <FileUploadField
      file={uploadedFile}
      onFileChange={(file) => {
        console.log('File uploaded:', file);
        if (file) {
          props.draft.updateKey(props.deepKey, file);
          if (file.alt) {
            props.draft.updateKey(`${props.deepKey}.alt`, file.alt);
          }
        } else {
          props.draft.removeKey(props.deepKey);
        }
        setUploadedFile(file);
      }}
    />
  );
};
