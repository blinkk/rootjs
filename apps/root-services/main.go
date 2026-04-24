package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"cloud.google.com/go/storage"
	"google.golang.org/appengine/v2"
	"google.golang.org/appengine/v2/blobstore"
	"google.golang.org/appengine/v2/image"
	"google.golang.org/appengine/v2/mail"
)

type ServingURLData struct {
	Success    bool   `json:"success"`
	ServingURL string `json:"servingUrl"`
}

func main() {
	http.HandleFunc("/_/serving_url", servingURLHandler)
	http.HandleFunc("/_/service_account", serviceAccountHandler)
	http.HandleFunc("/_/send_emails", sendEmailsHandler)
	log.Println("starting tools server")
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
		if strings.Contains(err.Error(), "UNSPECIFIED_ERROR") {
			log.Printf("ensure the bucket's access control policy is set to fine-grained. see: https://cloud.google.com/appengine/docs/standard/services/images")
		}
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

type SendEmailsResult struct {
	Success bool     `json:"success"`
	Sent    int      `json:"sent"`
	Failed  int      `json:"failed"`
	Errors  []string `json:"errors,omitempty"`
}

// sendEmailsHandler fetches pending emails from Firestore and sends them using
// the App Engine Mail API. It expects a ?projectId= query param to scope which
// project's email queue to process.
func sendEmailsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	w.Header().Set("Content-Type", "application/json")

	projectId := r.URL.Query().Get("projectId")
	if projectId == "" {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"success": false, "error": "missing required param: projectId"}`)
		return
	}

	fsClient, err := firestore.NewClient(ctx, firestore.DetectProjectID)
	if err != nil {
		log.Printf("failed to create firestore client: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"success": false, "error": "failed to init firestore"}`)
		return
	}
	defer fsClient.Close()

	result, err := processPendingEmails(ctx, fsClient, projectId)
	if err != nil {
		log.Printf("failed to process pending emails: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"success": false, "error": "failed to process emails"}`)
		return
	}

	data, err := json.Marshal(result)
	if err != nil {
		log.Printf("failed to serialize json: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"success": false}`)
		return
	}
	w.Write(data)
}

func processPendingEmails(ctx context.Context, fsClient *firestore.Client, projectId string) (*SendEmailsResult, error) {
	colPath := fmt.Sprintf("Projects/%s/Emails", projectId)
	query := fsClient.Collection(colPath).
		Where("status", "==", "pending").
		OrderBy("createdAt", firestore.Asc).
		Limit(100)

	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to query pending emails: %w", err)
	}

	result := &SendEmailsResult{Success: true}
	now := time.Now()
	for _, doc := range docs {
		data := doc.Data()

		// Skip emails that have expired.
		if expiredAt, ok := data["expiredAt"].(time.Time); ok && now.After(expiredAt) {
			log.Printf("skipping expired email %s", doc.Ref.ID)
			_, updateErr := doc.Ref.Update(ctx, []firestore.Update{
				{Path: "status", Value: "expired"},
			})
			if updateErr != nil {
				log.Printf("failed to update email status to expired: %v", updateErr)
			}
			continue
		}

		msg := &mail.Message{
			Sender:  fmt.Sprintf("%v", data["from"]),
			Subject: fmt.Sprintf("%v", data["subject"]),
			Body:    fmt.Sprintf("%v", data["body"]),
		}

		// Parse recipients.
		if toList, ok := data["to"].([]interface{}); ok {
			for _, t := range toList {
				msg.To = append(msg.To, fmt.Sprintf("%v", t))
			}
		}

		// Include HTML body if present.
		if htmlBody, ok := data["htmlBody"].(string); ok && htmlBody != "" {
			msg.HTMLBody = htmlBody
		}

		if err := mail.Send(ctx, msg); err != nil {
			log.Printf("failed to send email %s: %v", doc.Ref.ID, err)
			result.Failed++
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", doc.Ref.ID, err))
			// Mark as failed in Firestore.
			_, updateErr := doc.Ref.Update(ctx, []firestore.Update{
				{Path: "status", Value: "failed"},
				{Path: "error", Value: err.Error()},
			})
			if updateErr != nil {
				log.Printf("failed to update email status to failed: %v", updateErr)
			}
			continue
		}

		// Mark as sent in Firestore.
		_, updateErr := doc.Ref.Update(ctx, []firestore.Update{
			{Path: "status", Value: "sent"},
			{Path: "sentAt", Value: firestore.ServerTimestamp},
		})
		if updateErr != nil {
			log.Printf("failed to update email status to sent: %v", updateErr)
		}
		result.Sent++
	}

	log.Printf("processed %d emails for project %s: %d sent, %d failed", len(docs), projectId, result.Sent, result.Failed)
	return result, nil
}
