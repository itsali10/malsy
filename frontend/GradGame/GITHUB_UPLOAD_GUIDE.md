# GitHub Upload Guide - Step by Step

## Method 1: Using GitHub Desktop (Easiest - No Commands!)

### Step 1: Download GitHub Desktop
1. Go to https://desktop.github.com
2. Download and install GitHub Desktop
3. Sign in with your GitHub account

### Step 2: Create Repository on GitHub
1. Go to https://github.com
2. Click the **"+"** icon (top right) → **"New repository"**
3. Repository name: `Malsy`
4. Description: "Virtual Chemistry Lab - Educational Platform"
5. Choose: **Public** (or Private if you prefer)
6. **DON'T** check "Initialize with README" (we already have files)
7. Click **"Create repository"**

### Step 3: Upload Files with GitHub Desktop
1. Open **GitHub Desktop**
2. Click **"File" → "Add Local Repository"**
3. Click **"Choose"** and select your folder: `C:\Users\AM\OneDrive\Desktop\Malsy`
4. If it says "This directory does not appear to be a Git repository":
   - Click **"create a repository"**
   - Name: `Malsy`
   - Local path: `C:\Users\AM\OneDrive\Desktop\Malsy`
5. You'll see all your files listed
6. At bottom, type a commit message: `"Initial commit - Malsy project"`
7. Click **"Commit to main"**
8. Click **"Publish repository"** (top right)
9. Your files are now on GitHub! 🎉

---

## Method 2: Using Git Commands (Terminal)

### Step 1: Install Git
1. Go to https://git-scm.com/downloads
2. Download Git for Windows
3. Install (use default settings)
4. Restart your terminal/PowerShell

### Step 2: Create Repository on GitHub
1. Go to https://github.com
2. Click **"+"** → **"New repository"**
3. Name: `Malsy`
4. **DON'T** check "Initialize with README"
5. Click **"Create repository"**
6. Copy the repository URL (e.g., `https://github.com/yourusername/Malsy.git`)

### Step 3: Upload Files via Command Line

Open PowerShell in your project folder and run:

```powershell
# Navigate to your project (if not already there)
cd C:\Users\AM\OneDrive\Desktop\Malsy

# Initialize Git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Malsy project"

# Connect to GitHub (replace with YOUR repository URL)
git remote add origin https://github.com/yourusername/Malsy.git

# Rename branch to main
git branch -M main

# Upload to GitHub
git push -u origin main
```

**Note:** You'll be asked to login to GitHub. Use your GitHub username and a Personal Access Token (not password).

---

## Method 3: Direct Upload via GitHub Website

### Step 1: Create Repository
1. Go to https://github.com
2. Click **"+"** → **"New repository"**
3. Name: `Malsy`
4. Click **"Create repository"**

### Step 2: Upload Files
1. On the repository page, click **"uploading an existing file"**
2. Drag and drop your entire `Malsy` folder
3. Scroll down, type commit message: `"Initial commit"`
4. Click **"Commit changes"**
5. Done! ✅

**Note:** This method has a 100 file limit. If you have more files, use Method 1 or 2.

---

## Getting Personal Access Token (For Method 2)

If Git asks for authentication:

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click **"Generate new token"**
3. Name it: `Malsy Upload`
4. Check **"repo"** (full control of private repositories)
5. Click **"Generate token"**
6. **Copy the token** (you won't see it again!)
7. Use this token as your password when Git asks

---

## After Uploading

Your project will be live at:
- `https://github.com/yourusername/Malsy`

You can:
- Share the link with others
- Clone it on other computers
- Deploy to Netlify/Vercel
- Enable GitHub Pages for hosting

---

## Quick Commands Reference

```powershell
# Check Git is installed
git --version

# Check status
git status

# Add files
git add .

# Commit changes
git commit -m "Your message here"

# Push to GitHub
git push

# Pull latest changes
git pull
```

---

## Which Method Should You Use?

- **Method 1 (GitHub Desktop):** Best for beginners, visual interface
- **Method 2 (Commands):** Best for learning, more control
- **Method 3 (Website):** Quickest for small projects

**I recommend Method 1 (GitHub Desktop) - it's the easiest!** 🚀

