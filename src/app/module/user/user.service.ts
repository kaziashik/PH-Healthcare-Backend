import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";


const updateProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      image_PublicId: true,
      imageUrl: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, rejects) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
        },

        async (error, result) => {
          if (error) {
            return rejects(error);
          }
          if (!result) {
            return rejects(new Error("No result returned from Cloudinary"));
          }
          resolve(result);
        },
      )
      .end(buffer)
    },
    
  );

  const updatedUser= await prisma.user.update({
    where: {
        id: userId
    },
    data: {
        imageUrl: cloudinaryResult.secure_url,
        image_PublicId: cloudinaryResult.public_id
    },
    omit: {
        password: true,
    }
  });
  if(currentUser?.image_PublicId && currentUser.imageUrl){
    await cloudinary.uploader.destroy(currentUser.image_PublicId)
  }
  return updatedUser;
};

export const userService = {
  updateProfileImage,
};
