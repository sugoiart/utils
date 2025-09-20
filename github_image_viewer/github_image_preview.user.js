// ==UserScript==
// @name         GitHub PR Image Preview & Delete
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Easy way to view images in a pull request and delete them
// @author       jckli
// @match        https://github.com/*/*/pull/*/files
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// ==/UserScript==

(function () {
	"use strict";
	console.log("[Image Review Script v1.6] Initializing...");

	const TOKEN_KEY = "github_pr_image_delete_token";

	function init() {
		if (document.getElementById("image-review-btn")) return;
		const actionsContainer = document.querySelector(
			".pr-toolbar .diffbar",
		);
		if (actionsContainer) {
			console.log(
				"[Image Review Script] Found injection point. Creating button.",
			);
			const buttonContainer = document.createElement("div");
			buttonContainer.className = "diffbar-item";
			const reviewButton = document.createElement("button");
			reviewButton.innerHTML = "Image Review";
			reviewButton.id = "image-review-btn";
			reviewButton.className = "btn btn-sm";
			reviewButton.onclick = showImageReviewModal;
			buttonContainer.appendChild(reviewButton);
			actionsContainer.prepend(buttonContainer);
		}
	}

	async function showImageReviewModal() {
		let githubToken = await GM_getValue(TOKEN_KEY);
		if (!githubToken) {
			githubToken = prompt(
				"Please enter your GitHub Personal Access Token (with repo contents:write permission):",
			);
			if (githubToken) {
				await GM_setValue(TOKEN_KEY, githubToken);
			} else {
				alert("Token is required.");
				return;
			}
		}
		const images = findPrImagePaths();
		if (images.length === 0) {
			alert("No images found in this pull request.");
			return;
		}
		createModal(images, githubToken);
	}

	function findPrImagePaths() {
		console.log(
			"[Image Review Script] Searching for image paths...",
		);
		const imageExtensions = [
			".png",
			".jpg",
			".jpeg",
			".gif",
			".webp",
			".svg",
		];
		const imagePaths = [];
		const fileHeaders = document.querySelectorAll(
			"div.file-header[data-path]",
		);
		fileHeaders.forEach((header) => {
			const filePath = header.dataset.path;
			const isImage = imageExtensions.some((ext) =>
				filePath.toLowerCase().endsWith(ext),
			);
			if (isImage) {
				imagePaths.push({
					path: filePath,
					element: header.closest(".file"),
				});
			}
		});
		console.log(
			`[Image Review Script] Found ${imagePaths.length} image paths.`,
		);
		return imagePaths;
	}

	function createModal(images, token) {
		const [owner, repo] = window.location.pathname
			.split("/")
			.slice(1, 3);
		const headBranchElement = document.querySelector(
			".head-ref a, .head-ref .css-truncate-target",
		);
		if (!headBranchElement) {
			alert("Could not determine the source branch name.");
			return;
		}
		const headBranch = headBranchElement.innerText;

		const modalOverlay = document.createElement("div");
		modalOverlay.id = "image-review-overlay";
		modalOverlay.onclick = () => modalOverlay.remove();
		applyStyles(modalOverlay, {
			position: "fixed",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			backgroundColor: "rgba(0, 0, 0, 0.7)",
			zIndex: "9999",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
		});
		const modalContent = document.createElement("div");
		modalContent.onclick = (e) => e.stopPropagation();
		applyStyles(modalContent, {
			background: "#161b22",
			border: "1px solid #30363d",
			borderRadius: "8px",
			width: "90vw",
			height: "90vh",
			overflowY: "auto",
			padding: "20px",
			boxSizing: "border-box",
		});
		const imageGrid = document.createElement("div");
		applyStyles(imageGrid, {
			display: "grid",
			gridTemplateColumns:
				"repeat(auto-fill, minmax(250px, 1fr))",
			gap: "20px",
		});

		images.forEach((image) => {
			const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${headBranch}/${image.path}`;
			const container = document.createElement("div");
			container.id = `review-container-${image.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
			applyStyles(container, {
				background: "#0d1117",
				border: "1px solid #30363d",
				borderRadius: "6px",
				padding: "10px",
				display: "flex",
				flexDirection: "column",
			});
			const img = document.createElement("img");
			img.src = imageUrl;
			applyStyles(img, {
				width: "100%",
				height: "auto",
				objectFit: "cover",
				borderRadius: "4px",
				minHeight: "150px",
				background: "#30363d",
			});
			const info = document.createElement("div");
			info.textContent = image.path.split("/").pop();
			applyStyles(info, {
				color: "#c9d1d9",
				fontSize: "12px",
				wordBreak: "break-all",
				padding: "8px 0",
				flexGrow: "1",
			});
			const deleteButton = document.createElement("button");
			deleteButton.innerHTML = "🗑️ Delete File";
			deleteButton.className = "btn btn-sm btn-danger";
			deleteButton.onclick = () =>
				getShaAndDelete(
					token,
					owner,
					repo,
					headBranch,
					image,
					container,
				);
			container.append(img, info, deleteButton);
			imageGrid.appendChild(container);
		});
		modalContent.appendChild(imageGrid);
		modalOverlay.appendChild(modalContent);
		document.body.appendChild(modalOverlay);
	}

	function getShaAndDelete(
		token,
		owner,
		repo,
		branch,
		image,
		containerElement,
	) {
		if (
			!confirm(
				`Are you sure you want to permanently delete "${image.path}" from this branch?`,
			)
		)
			return;

		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${image.path}?ref=${branch}`;
		containerElement.style.opacity = "0.5";
		const deleteButton = containerElement.querySelector("button");
		deleteButton.disabled = true;
		deleteButton.textContent = "Deleting...";

		console.log(
			`[Image Review Script] Step 1: Fetching current SHA for ${image.path}`,
		);
		GM_xmlhttpRequest({
			method: "GET",
			url: apiUrl,
			headers: {
				Authorization: `token ${token}`,
				Accept: "application/vnd.github.v3+json",
			},
			onload: function (response) {
				if (response.status === 200) {
					const fileData = JSON.parse(
						response.responseText,
					);
					console.log(
						`[Image Review Script] ...Success. Current SHA is ${fileData.sha}`,
					);
					// STEP 2: Execute the deletion with the fresh SHA.
					executeDelete(
						token,
						owner,
						repo,
						branch,
						image,
						fileData.sha,
						containerElement,
					);
				} else if (response.status === 404) {
					alert(
						"File not found. It may have been deleted already.",
					);
					containerElement.remove();
				} else {
					alert(
						`Could not get file details. API Error: ${JSON.parse(response.responseText).message}`,
					);
					containerElement.style.opacity = "1";
					deleteButton.disabled = false;
					deleteButton.textContent =
						"Delete File";
				}
			},
			onerror: function (response) {
				alert(
					"A network error occurred while getting file details.",
				);
				containerElement.style.opacity = "1";
				deleteButton.disabled = false;
				deleteButton.textContent = "Delete File";
			},
		});
	}

	function executeDelete(
		token,
		owner,
		repo,
		branch,
		image,
		currentSha,
		containerElement,
	) {
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${image.path}`;
		const commitMessage = `chore: delete image (${image.path})`;

		console.log(
			`[Image Review Script] Step 2: Deleting ${image.path} with fresh SHA.`,
		);
		GM_xmlhttpRequest({
			method: "DELETE",
			url: apiUrl,
			headers: {
				Authorization: `token ${token}`,
				Accept: "application/vnd.github.v3+json",
			},
			data: JSON.stringify({
				message: commitMessage,
				sha: currentSha,
				branch: branch,
			}),
			onload: function (response) {
				if (response.status === 200) {
					console.log(
						"[Image Review Script] ...Success. File deleted.",
					);
					containerElement.remove();
					image.element.style.display = "none";
				} else {
					const error = JSON.parse(
						response.responseText,
					);
					alert(
						`Failed to delete file.\nGitHub API Error: ${error.message}`,
					);
					containerElement.style.opacity = "1";
					const deleteButton =
						containerElement.querySelector(
							"button",
						);
					deleteButton.disabled = false;
					deleteButton.textContent =
						"🗑️ Delete File";
				}
			},
			onerror: function (response) {
				alert(
					"A network error occurred during deletion.",
				);
				containerElement.style.opacity = "1";
			},
		});
	}

	function applyStyles(element, styles) {
		for (const property in styles) {
			element.style[property] = styles[property];
		}
	}
	const observer = new MutationObserver(() => {
		if (!document.getElementById("image-review-btn")) init();
	});
	observer.observe(document.body, { childList: true, subtree: true });
	setTimeout(init, 1000);
})();
