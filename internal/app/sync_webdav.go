package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const webdavClientTimeout = 30 * time.Second

// WebDAV 客户端实现

// webdavClient WebDAV 连接参数
type webdavClient struct {
	BaseURL    string
	Username   string
	Password   string
	RemotePath string
	httpClient *http.Client
}

func newWebDAVClient(cfg *SyncConfig) *webdavClient {
	return &webdavClient{
		BaseURL:    strings.TrimRight(cfg.WebDAVURL, "/"),
		Username:   cfg.WebDAVUsername,
		Password:   cfg.WebDAVPassword,
		RemotePath: strings.Trim(cfg.RemotePath, "/"),
		httpClient: &http.Client{Timeout: webdavClientTimeout},
	}
}

// remotePath 拼接远端路径
func (c *webdavClient) remotePath(name string) string {
	if c.RemotePath == "" {
		return c.BaseURL + "/" + name
	}
	return c.BaseURL + "/" + c.RemotePath + "/" + name
}

// mkdirAll 在 WebDAV 创建远端目录
func (c *webdavClient) mkdirAll(path string) error {
	// 先创建父目录，再创建子目录
	parts := strings.Split(strings.Trim(path, "/"), "/")
	built := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if built == "" {
			built = p
		} else {
			built += "/" + p
		}
		var fullPath string
		if c.RemotePath == "" {
			fullPath = c.BaseURL + "/" + built
		} else {
			fullPath = c.BaseURL + "/" + c.RemotePath + "/" + built
		}
		req, err := http.NewRequest("MKCOL", fullPath, nil)
		if err != nil {
			return err
		}
		req.SetBasicAuth(c.Username, c.Password)
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return err
		}
		resp.Body.Close()
		// 201 Created 或 405 Method Not Allowed（已存在）都是可接受的
		if resp.StatusCode != 201 && resp.StatusCode != 405 && resp.StatusCode != 200 {
			return fmt.Errorf("MKCOL %s: %s", fullPath, resp.Status)
		}
	}
	return nil
}

// putFile 上传文件内容
func (c *webdavClient) putFile(name string, content []byte) error {
	// 确保目录存在
	dir := ""
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		dir = name[:idx]
	}
	if dir != "" {
		if err := c.mkdirAll(dir); err != nil {
			return fmt.Errorf("mkdir %s: %w", dir, err)
		}
	}

	req, err := http.NewRequest("PUT", c.remotePath(name), bytes.NewReader(content))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.Username, c.Password)
	req.ContentLength = int64(len(content))
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PUT %s: %s: %s", name, resp.Status, string(body))
	}
	return nil
}

// getFile 下载文件内容
func (c *webdavClient) getFile(name string) ([]byte, error) {
	req, err := http.NewRequest("GET", c.remotePath(name), nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(c.Username, c.Password)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, nil // 文件不存在
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GET %s: %s", name, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

// deleteFile 删除远端文件
func (c *webdavClient) deleteFile(name string) error {
	req, err := http.NewRequest("DELETE", c.remotePath(name), nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.Username, c.Password)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("DELETE %s: %s", name, resp.Status)
	}
	return nil
}

// getManifest 获取远端 manifest
func (c *webdavClient) getManifest() (*SyncManifest, error) {
	data, err := c.getFile("manifest.json")
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, nil // 远端尚无数据
	}
	var m SyncManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}

// putManifest 更新远端 manifest
func (c *webdavClient) putManifest(m *SyncManifest) error {
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return c.putFile("manifest.json", data)
}

// validateConnection 验证 WebDAV 连接是否可用
func (c *webdavClient) validateConnection() error {
	var url string
	if c.RemotePath == "" {
		url = c.BaseURL + "/"
	} else {
		url = c.BaseURL + "/" + c.RemotePath + "/"
	}
	req, err := http.NewRequest("OPTIONS", url, nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.Username, c.Password)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return fmt.Errorf("authentication failed")
	}
	if resp.StatusCode >= 400 {
		// 尝试 PROPFIND
		req2, err2 := http.NewRequest("PROPFIND", url, nil)
		if err2 != nil {
			return fmt.Errorf("connection failed: %w", err2)
		}
		req2.SetBasicAuth(c.Username, c.Password)
		req2.Header.Set("Depth", "0")
		resp2, err := c.httpClient.Do(req2)
		if err != nil {
			return fmt.Errorf("connection failed: %w", err)
		}
		resp2.Body.Close()
		if resp2.StatusCode == 401 {
			return fmt.Errorf("authentication failed")
		}
		if resp2.StatusCode >= 400 && resp2.StatusCode != 404 {
			return fmt.Errorf("server returned %s", resp2.Status)
		}
	}
	return nil
}
