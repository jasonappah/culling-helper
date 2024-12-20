import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { expandGlob, exists } from "jsr:@std/fs@1.0.6"
import { exiftool } from "npm:exiftool-vendored@29.0.0";

const TEN_GB_IN_BYTES = 10_000_000_000
const VERSION = "0.0.1"

await new Command()
  .name("culling-helper")
  .description("A CLI to help me with culling photos on a network drive.")
  .version(VERSION)
  .command("prepare", "Convert RAW photos to JPGs")
  .option("-d, --directory <directory:file>", "Directory to search for RAW photos", {default: Deno.cwd()})
  .option("-l, --limit <bytes:number>", "Limit the file size of each batch", {default: TEN_GB_IN_BYTES }) 
  .action(async (options) => {
    const folderSizeLimit = Number(options.limit);
    const absoluteDirectory = await Deno.realPath(options.directory);
    await goHome(absoluteDirectory);
    const images = expandGlob('./*.CR3', {
      includeDirs: false,
      root: absoluteDirectory
    });

    let batchNo = 1;
    let folderSizeBytes = 0;

    const failedPreviewExtractions: string[] = []

    const jpgToRawMapping: Record<string, string> = {};
    
    for await (const image of images) {
      const jpgOutputPath = `./${batchNo}/${image.name.replace(".CR3", ".jpg")}`
      const jpgExists = await exists(jpgOutputPath)
      if (jpgExists) {
      	console.log(`Skipping ${image.name} since a corresponding JPG already exists.`)
        continue;
      }
      try {
      	 await exiftool.extractPreview(image.path, jpgOutputPath);
      } catch (e) {
      	console.error(`Preview extraction failed, skipping ${image.name}.`, e)
      	failedPreviewExtractions.push(image.path)
      	continue
      }
      const imageSizeBytes = await Deno.stat(jpgOutputPath).then((stat) => stat.size);
      console.log(`[${batchNo}] ${image.path} -> ${jpgOutputPath} (${imageSizeBytes} bytes)`);
      jpgToRawMapping[jpgOutputPath] = image.path;
      folderSizeBytes += imageSizeBytes;

      if (folderSizeBytes > folderSizeLimit) {
        console.log("Beginning new batch.")
        batchNo++;
        folderSizeBytes = 0;
      }
    }
    console.log("Done converting!")
    
    await Deno.writeTextFile('./mapping.json', JSON.stringify(jpgToRawMapping))
	console.log("Wrote mappings to disk!")

	// Throwing an error here so that hopefully most of the extractions excluding the failures succeed,
	// instead of exiting in the middle of all the raws and having to redo all of them or pick up in the middle.
	// then we exit the CLI with a non-zero exit code to inform me of the failures
	if (failedPreviewExtractions.length > 0) {
		throw new Error(`Some raws failed to have previews extracted: ${failedPreviewExtractions.join(", ")}`)
	}
	
  })
  .command("extract", "Extract ratings from JPGs to JSON file")
  .option("-d, --directory <directory:file>", "Directory to search for rated JPG batches", {default: Deno.cwd()})
  .action(async (options) => {
    const absoluteDirectory = await Deno.realPath(options.directory);
    await goHome(absoluteDirectory);

    const jpgToRawMapping = JSON.parse(await Deno.readTextFile('./mapping.json'));
    console.log("Loaded mapping.")

    const ratings: Record<string, number | undefined> = {};

    for (const image of Object.keys(jpgToRawMapping)) {
      const path = await Deno.realPath(image)
      const metadata = await exiftool.read(path);
      const rating = metadata.Rating ?? 0;
      ratings[image] = rating;
      console.log(`Added ${image} with rating ${rating} to record.`)
    }

    await Deno.writeTextFile('./ratings.json', JSON.stringify(ratings))
  })
  .command("apply", "Apply ratings from JSON file to RAW photos")
  .option("-d, --directory <directory:file>", "Directory to search for rated JPG batches", {default: Deno.cwd()})
  .action(async (options) => {
    const absoluteDirectory = await Deno.realPath(options.directory);
    await goHome(absoluteDirectory);

    const ratings = JSON.parse(await Deno.readTextFile('./ratings.json'));
    console.log("Loaded ratings.")
    const jpgToRawMapping = JSON.parse(await Deno.readTextFile('./mapping.json'));
    console.log("Loaded mapping.")

    
    for (const jpgRelativePath of Object.keys(ratings)) {
      const rawPath = jpgToRawMapping[jpgRelativePath];
      const rating = ratings[jpgRelativePath]

      await exiftool.write(rawPath, {
        Rating: rating,
      }, {
        writeArgs: ["-overwrite_original"]
      });
    }
  })
  .parse();

async function goHome(dir: string) {
  const h = `${dir}/culling-helper`
  await Deno.mkdir(h, {recursive: true});
  Deno.chdir(h);
  await Deno.writeTextFile(`${h}/README.md`, "This directory is used to store temporary files created by [`culling-helper`](https://github.com/jasonappah/culling-helper). It is safe to delete this directory. CLI version: ${VERSION}");
}
