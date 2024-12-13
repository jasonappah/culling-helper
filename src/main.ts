import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { expandGlob, exists } from "jsr:@std/fs@1.0.6"
import { exiftool } from "npm:exiftool-vendored@29.0.0";

const TEN_GB_IN_BYTES = 10_000_000_000

await new Command()
  .name("culling-helper")
  .description("A CLI to help me with culling photos on a network drive.")
  .version("0.0.1")
  .command("prepare", "Convert RAW photos to JPGs")
  .option("-d, --directory <directory:file>", "Directory to search for RAW photos", {default: Deno.cwd()})
  .option("-l, --limit <bytes:number>", "Limit the file size of each batch", {default: TEN_GB_IN_BYTES }) 
  .action(async (options) => {
    const folderSizeLimit = Number(options.limit);
    const absoluteDirectory = await Deno.realPath(options.directory);
    const images = expandGlob(`./*.CR3`, {
      includeDirs: false,
      root: absoluteDirectory
    });

    let batchNo = 1;
    let folderSizeBytes = 0;

    const jpgToRawMapping: Record<string, string> = {};
    
    await goHome(absoluteDirectory);
    for await (const image of images) {
      const jpgOutputPath = `./${batchNo}/${image.name.replace(".CR3", ".jpg")}`
      const jpgExists = await exists(jpgOutputPath)
      if (jpgExists) {
        continue;
      }
      await exiftool.extractPreview(image.path, jpgOutputPath);
      const imageSizeBytes = await Deno.stat(jpgOutputPath).then((stat) => stat.size);
      console.log(`[${batchNo}] ${image.path} -> ${jpgOutputPath} (${imageSizeBytes} bytes)`);
      jpgToRawMapping[jpgOutputPath] = image.path;
      folderSizeBytes += imageSizeBytes;

      if (folderSizeBytes > folderSizeLimit) {
        batchNo++;
        folderSizeBytes = 0;
      }
    }
    
    await Deno.writeTextFile(`./mapping.json`, JSON.stringify(jpgToRawMapping))

  })
  .command("extract", "Extract ratings from JPGs to JSON file")
  .option("-d, --directory <directory:file>", "Directory to search for rated JPG batches", {default: Deno.cwd()})
  .action(async (options) => {
    const absoluteDirectory = await Deno.realPath(options.directory);
    await goHome(absoluteDirectory);

    const jpgToRawMapping = JSON.parse(await Deno.readTextFile(`./mapping.json`));
    
    const ratings: Record<string, number | undefined> = {};

    for (const image of Object.keys(jpgToRawMapping)) {
      const path = await Deno.realPath(image)
      const metadata = await exiftool.read(path);
      const rating = metadata.Rating;
      ratings[image] = rating;
    }

    await Deno.writeTextFile(`./ratings.json`, JSON.stringify(ratings))
  })
  .command("apply", "Apply ratings from JSON file to RAW photos")
  .option("-d, --directory <directory:file>", "Directory to search for rated JPG batches", {default: Deno.cwd()})
  .action(async (options) => {
    const absoluteDirectory = await Deno.realPath(options.directory);
    await goHome(absoluteDirectory);

    const ratings = JSON.parse(await Deno.readTextFile(`./ratings.json`));
    const jpgToRawMapping = JSON.parse(await Deno.readTextFile(`./mapping.json`));
    
    for (const jpgRelativePath of Object.keys(jpgToRawMapping)) {
      const rawPath = jpgToRawMapping[jpgRelativePath];
      const rating = jpgRelativePath in ratings ? ratings[jpgRelativePath] : 0;
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
}