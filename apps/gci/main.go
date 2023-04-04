package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"cloud.google.com/go/storage"
	"google.golang.org/appengine/v2"
	"google.golang.org/appengine/v2/blobstore"
	"google.golang.org/appengine/v2/image"
)

type ServingURLData struct {
	Success    bool   `json:"success"`
	ServingURL string `json:"servingUrl"`
}

func main() {
	http.HandleFunc("/_/serving_url", servingURLHandler)
	http.HandleFunc("/_/service_account", serviceAccountHandler)
	log.Println("starting gci server")
	appengine.Main()
}

// servingURLHandler accepts a ?gcs= param and returns an image serving URL.
func servingURLHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")
	gcsPath := r.URL.Query().Get("gcs")
	servingUrl, err := getServingURL(gcsPath)
	if err != nil {
		log.Printf("failed to get serving url: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "{\"success\": false}")
		return
	}
	resData := ServingURLData{Success: true, ServingURL: servingUrl}
	data, err := json.Marshal(resData)
	if err != nil {
		log.Printf("failed to serialize json: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, "{\"success\": false}")
		return
	}
	w.Write(data)
}

func getServingURL(gcsPath string) (string, error) {
	ctx := appengine.BackgroundContext()
	blobkey, err := blobstore.BlobKeyForFile(ctx, "/gs"+gcsPath)
	if err != nil {
		log.Printf("failed to get blobstore key: %v", err)
		return "", err
	}
	url, err := image.ServingURL(ctx, blobkey, &image.ServingURLOptions{Secure: true})
	if err != nil {
		log.Printf("failed to get image serving url: %v", err)
		if !strings.Contains(gcsPath, ".copy") {
			copyGcsPath, err := cloneGCSFile(gcsPath)
			if err != nil {
				log.Printf("failed to clone %s: %v", gcsPath, err)
				return "", err
			}
			return getServingURL(copyGcsPath)
		}
		return "", err
	}
	return url.String(), err
}

func cloneGCSFile(gcsPath string) (string, error) {
	ctx := appengine.BackgroundContext()
	gcsClient, err := storage.NewClient(ctx)
	if err != nil {
		return "", err
	}
	parts := strings.Split(gcsPath, "/")
	bucketName := parts[1]
	srcPath := strings.Join(parts[2:], "/")
	dstPath := addCopyToFilename(srcPath)
	bucket := gcsClient.Bucket(bucketName)
	src := bucket.Object(srcPath)
	dst := bucket.Object(dstPath)
	_, err = dst.CopierFrom(src).Run(ctx)
	newGcsPath := "/" + bucketName + "/" + dstPath
	log.Printf("copying to: %v", newGcsPath)
	return newGcsPath, err
}

func addCopyToFilename(fileName string) string {
	// Find the last occurrence of "." in the filename.
	dotIndex := strings.LastIndex(fileName, ".")
	// If the dot is not found, return the original filename with ".copy".
	if dotIndex == -1 {
		return fileName + ".copy"
	}
	// Split the filename into its name and extension parts.
	name := fileName[:dotIndex]
	ext := fileName[dotIndex:]
	// Return the new filename with ".copy" added before the extension.
	return name + ".copy" + ext
}

type ServiceAccountData struct {
	Success        bool   `json:"success"`
	ServiceAccount string `json:"serviceAccount"`
}

// serviceAccountHandler prints the service account email address associated
// with the app. GCS buckets should share access with this service account in
// order to create serving URLs.
func serviceAccountHandler(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.BackgroundContext()
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")
	serviceAccount, err := appengine.ServiceAccount(ctx)
	if err != nil {
		log.Printf("failed to get service account: %v", err)
		fmt.Fprint(w, "{\"success\": false}")
		return
	}
	resData := ServiceAccountData{Success: true, ServiceAccount: serviceAccount}
	data, err := json.Marshal(resData)
	if err != nil {
		log.Printf("failed to serialize json: %v", err)
		fmt.Fprint(w, "{\"success\": false}")
		return
	}
	w.Write(data)
}
