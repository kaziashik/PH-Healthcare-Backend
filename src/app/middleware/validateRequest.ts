import z from "zod";
import { catchAsync } from "../utils/catchAsync";
import { NextFunction, Request, Response } from "express";

export const validateRequest=(zodSchema: z.ZodObject)=>{
    return catchAsync((req: Request, res: Response, next: NextFunction) => {
    
      // const payload =req.body ? req.body : {}
      const payload = req.body ?? {};

      const result =zodSchema.safeParse(payload);

      if (!result.success) {
        console.log(result.error);

        //##############
        // for multiple error-->
        //#####################
        
        // let errorMessage = "";
        // result.error.issues.forEach((issue) => {
        //   errorMessage = errorMessage + " " + issue.message;
        // });
        // throw new Error(errorMessage);

        throw new Error(result.error.issues[0].message)
      }

      //// its like infinite tone -- avegeer 9 we did for sinitizetion
      req.body=result.data

      next();

    } 
  )
}