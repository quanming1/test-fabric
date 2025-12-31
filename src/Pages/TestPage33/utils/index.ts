export function openFilePicker(options?: {
    accept?: string;
    multiple?: boolean;
}): Promise<File | null> {
    const { accept = "*/*", multiple = false } = options || {};

    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0] ?? null;
            resolve(file);
        };

        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}
